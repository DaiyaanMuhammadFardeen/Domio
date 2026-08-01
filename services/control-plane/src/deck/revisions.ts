import type { DeckDocument, ULID } from '@domio/schema';
import {
  DECK_SCHEMA_VERSION,
  defaultMigrator,
  upgradeOnRead,
  NoMigrationPathError,
} from '@domio/schema';

/**
 * Phase 05 revision & schema versioning — control-plane side.
 *
 * Snapshots stored in the durable log carry an incrementing
 * `revision` (`bigint`, monotonic per `(deck_id, branch_id)`) and a
 * `schema_version`. The {@link RevisionService} is the single point
 * of coordination between the {@link DocumentLoader}'s optimistic
 * locking, the snapshot materializer's `revision` accounting, and the
 * migrate-on-read path.
 *
 * The contract is intentionally narrow: a service object exposes
 * `nextRevision`, `bump`, and `applyVersioning`, and the
 * `RevisionRepository` is pluggable so tests can run against
 * in-memory storage.
 */

export interface RevisionRecord {
  /** Deck identifier. */
  readonly deckId: ULID;
  /** Branch identifier; `"main"` when not on a user-created branch. */
  readonly branchId: string;
  /** Current head revision on this `(deck, branch)`. */
  readonly revision: number;
  /** Last snapshot's schema version, if any. */
  readonly schemaVersion?: string;
}

export interface RevisionRepository {
  /** Look up the head revision for a `(deck, branch)`. */
  fetchHead(deckId: ULID, branchId: string): Promise<RevisionRecord | null>;
  /** Atomically advance the head. Returns the new revision. */
  bump(
    deckId: ULID,
    branchId: string,
    expectedRevision: number,
    schemaVersion: string,
  ): Promise<RevisionRecord>;
}

export class RevisionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`Revision conflict: expected ${expected} but found ${actual}.`);
    this.name = 'RevisionConflictError';
  }
}

/**
 * Service object held by the control-plane; both the
 * `DocumentLoader.save` path and the merge commit path consume it.
 */
export class RevisionService {
  constructor(
    private readonly repository: RevisionRepository,
    private readonly currentVersion: string = DECK_SCHEMA_VERSION,
  ) {}

  /** The schema version newly written snapshots will carry. */
  currentSchemaVersion(): string {
    return this.currentVersion;
  }

  /**
   * Fetch the current head revision. Returns `0` for an unseen
   * `(deck, branch)` so callers can treat the first save as
   * `expectedRevision: 0`.
   */
  async head(deckId: ULID, branchId: string): Promise<number> {
    const record = await this.repository.fetchHead(deckId, branchId);
    return record?.revision ?? 0;
  }

  /**
   * Advance the head atomically. Throws {@link RevisionConflictError}
   * on optimistic-lock mismatches; idempotent on `expected == newRevision`.
   */
  async bump(args: {
    deckId: ULID;
    branchId: string;
    expectedRevision: number;
    schemaVersion?: string;
  }): Promise<RevisionRecord> {
    return this.repository.bump(
      args.deckId,
      args.branchId,
      args.expectedRevision,
      args.schemaVersion ?? this.currentVersion,
    );
  }

  /**
   * Apply the package's migrate-on-read driver to a stored document.
   * Surfaces the package's typed errors unchanged so upstream callers
   * can switch on them.
   */
  applyVersioning(document: DeckDocument): DeckDocument {
    return upgradeOnRead(document, defaultMigrator());
  }
}

/**
 * In-memory `RevisionRepository` for tests and the Phase 02
 * `NoopDeckRepository` analogue. Optimistic locking is enforced
 * through a per-key lock.
 */
export class InMemoryRevisionRepository implements RevisionRepository {
  private readonly heads = new Map<string, RevisionRecord>();

  async fetchHead(deckId: ULID, branchId: string): Promise<RevisionRecord | null> {
    return this.heads.get(this.key(deckId, branchId)) ?? null;
  }

  async bump(
    deckId: ULID,
    branchId: string,
    expectedRevision: number,
    schemaVersion: string,
  ): Promise<RevisionRecord> {
    const key = this.key(deckId, branchId);
    const current = this.heads.get(key);
    const actual = current?.revision ?? 0;
    if (actual !== expectedRevision) {
      throw new RevisionConflictError(expectedRevision, actual);
    }
    const next: RevisionRecord = {
      deckId,
      branchId,
      revision: actual + 1,
      schemaVersion,
    };
    this.heads.set(key, next);
    return next;
  }

  /** Test-only: preload a head (e.g. simulating a restored snapshot). */
  seed(record: RevisionRecord): void {
    this.heads.set(this.key(record.deckId, record.branchId), record);
  }

  private key(deckId: ULID, branchId: string): string {
    return `${deckId}|${branchId}`;
  }
}

export { NoMigrationPathError };
