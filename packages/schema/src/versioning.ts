import type { DeckDocument, ULID } from './generated/scene-graph.js';
import { DECK_SCHEMA_VERSION, parseVersion, type Semver } from './version.js';
import { MigrationRegistry } from './registry.js';
import { SchemaMigrator } from './migrate.js';
import { validate } from './validate.js';

/**
 * Schema-versioning policy for Phase 05 snapshots and merge replays.
 *
 * Snapshots store a `schema_version` (e.g. "1.0.0"). When the loader
 * reads a deck whose stored version differs from `DECK_SCHEMA_VERSION`,
 * it applies a chain of {@link SchemaMigration}s lazily on the way out.
 *
 * The rules:
 *
 *   1. v1 → v1 is a no-op.
 *   2. Forward upgrades (lower major → current major) require a
 *      registered migration. The {@link MigrationRegistry} fails closed
 *      (returns `null`) when no path exists; callers should treat that
 *      as a terminal error and not a fallback.
 *   3. Downgrades (higher major → lower major) are not allowed — once
 *      the schema moves forward, old clients must replay their own
 *      view through a compatibility projection.
 *   4. Same major upgrades (e.g. 1.0.0 → 1.4.0) are guaranteed additive
 *      per the Phase 02 contract (`SEMVER_COMPATIBLE`); the migrator
 *      still revalidates the output.
 *
 * The Phase 05 durable op log carries `schema_version` on every
 * snapshot row so the sync worker and the control-plane loader can
 * answer "what version was this snapshot frozen at?" without touching
 * the snapshot payload.
 */

export interface SnapshotVersion {
  /** The schema version the snapshot was frozen at (e.g. "1.0.0"). */
  readonly version: string;
  /** Major component parsed out, cached for hot-path comparisons. */
  readonly major: number;
  /** Whether the snapshot is current major (no upgrade needed). */
  readonly isCurrentMajor: (currentVersion?: string) => boolean;
}

/** Minimal shape required of a snapshot row in the durable log. */
export interface SnapshotMetadata {
  readonly deckId: ULID;
  readonly branchId: string;
  readonly revision: number;
  readonly schemaVersion: string;
  readonly hlcPhysical: number;
  readonly hlcLogical: number;
}

/**
 * Parse and inspect a snapshot's `schema_version` field. The returned
 * predicate is cheap (semver comparison only) and safe to use on every
 * snapshot read.
 */
export function inspectSnapshotVersion(
  schemaVersion: string,
  currentVersion: string = DECK_SCHEMA_VERSION,
): SnapshotVersion {
  const parsed: Semver | null = parseVersion(schemaVersion);
  const current: Semver | null = parseVersion(currentVersion);
  if (parsed === null || current === null) {
    throw new Error(
      `Snapshot schema_version "${schemaVersion}" or current "${currentVersion}" is not a valid semver.`,
    );
  }
  return {
    version: schemaVersion,
    major: parsed.major,
    isCurrentMajor: () => parsed.major === current!.major,
  };
}

/** True when a stored version can be read without applying migrations. */
export function isCurrentSchemaVersion(
  stored: string,
  current: string = DECK_SCHEMA_VERSION,
): boolean {
  return stored === current;
}

/**
 * Build a {@link SchemaMigrator} preconfigured with the registry the
 * package ships with. Phase 05 wires this into
 * `services/control-plane/modules/deck/src/schema-version.ts` so the
 * loader, the snapshot materializer, and the merge replays all share
 * the same migration chain.
 */
export function defaultMigrator(
  registry: MigrationRegistry = new MigrationRegistry(),
): SchemaMigrator {
  return new SchemaMigrator(DECK_SCHEMA_VERSION, registry);
}

/**
 * Upgrade-on-read driver. Given a stored document with possibly older
 * `schemaVersion`, returns a document at {@link DECK_SCHEMA_VERSION}
 * with the structural validator re-applied post-migration.
 *
 * Throws `NoMigrationPathError` when the registry has no path.
 */
export function upgradeOnRead(
  document: DeckDocument,
  migrator: SchemaMigrator = defaultMigrator(),
): DeckDocument {
  if (isCurrentSchemaVersion(document.schemaVersion, migrator.current())) {
    // Re-validate to catch drift between version metadata and structure.
    const result = validate(document);
    if (!result.valid) {
      throw new InvalidMigratedDocumentError(result.errors);
    }
    return document;
  }
  let migrated: DeckDocument;
  try {
    migrated = migrator.apply(document);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('No schema migration path')) {
      throw new NoMigrationPathError(document.schemaVersion, migrator.current());
    }
    throw err;
  }
  const after = validate(migrated);
  if (!after.valid) {
    throw new InvalidMigratedDocumentError(after.errors);
  }
  return migrated;
}

/**
 * Decide whether a stored snapshot can be replayed against the
 * runtime. The Phase 05 sync worker uses this guard before
 * re-materializing a snapshot so it never applies a no-op migration on
 * a stale payload.
 */
export function canReplaySnapshot(
  snapshotSchemaVersion: string,
  runtimeSchemaVersion: string = DECK_SCHEMA_VERSION,
): boolean {
  const info = inspectSnapshotVersion(snapshotSchemaVersion, runtimeSchemaVersion);
  return info.major === parseVersion(runtimeSchemaVersion)!.major;
}

export class NoMigrationPathError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`No schema migration path from ${from} to ${to}.`);
    this.name = 'NoMigrationPathError';
  }
}

export interface MigratedDocumentError {
  code: string;
  path: string;
  message: string;
}

export class InvalidMigratedDocumentError extends Error {
  constructor(public readonly errors: ReadonlyArray<MigratedDocumentError>) {
    super(`Migrated document failed validation: ${errors.length} error(s).`);
    this.name = 'InvalidMigratedDocumentError';
  }
}
