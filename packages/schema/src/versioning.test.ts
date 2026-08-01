import { describe, it, expect } from 'vitest';
import {
  DECK_SCHEMA_VERSION,
  parseVersion,
  SEMVER_COMPATIBLE,
} from './version.js';
import { MigrationRegistry } from './registry.js';
import {
  inspectSnapshotVersion,
  isCurrentSchemaVersion,
  canReplaySnapshot,
  defaultMigrator,
  upgradeOnRead,
  NoMigrationPathError,
  InvalidMigratedDocumentError,
} from './versioning.js';
import { asULID, type DeckDocument } from './generated/scene-graph.js';

function makeDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
  const base: DeckDocument = {
    schemaVersion: DECK_SCHEMA_VERSION,
    id: asULID('01H00000000000000000000000'),
    tenantId: 'tenant',
    workspaceId: asULID('01H00000000000000000000001'),
    title: 'Test',
    revision: 1,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: asULID('01H00000000000000000000002'),
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [],
      },
    ],
  };
  return { ...base, ...overrides };
}

describe('inspectSnapshotVersion', () => {
  it('returns major + isCurrentMajor predicate', () => {
    const info = inspectSnapshotVersion('1.0.0', DECK_SCHEMA_VERSION);
    expect(info.major).toBe(parseVersion(DECK_SCHEMA_VERSION)!.major);
    expect(info.isCurrentMajor()).toBe(true);
  });

  it('throws on invalid semver', () => {
    expect(() => inspectSnapshotVersion('not-a-version', DECK_SCHEMA_VERSION)).toThrow();
  });

  it('predicate is false for a future major', () => {
    const info = inspectSnapshotVersion('2.0.0', DECK_SCHEMA_VERSION);
    expect(info.isCurrentMajor()).toBe(false);
  });
});

describe('isCurrentSchemaVersion', () => {
  it('returns true for the exact current version', () => {
    expect(isCurrentSchemaVersion('1.0.0')).toBe(true);
  });

  it('returns false for older versions', () => {
    expect(isCurrentSchemaVersion('0.9.0')).toBe(false);
  });

  it('returns false for forward-incompatible versions', () => {
    expect(isCurrentSchemaVersion('2.0.0')).toBe(false);
  });
});

describe('canReplaySnapshot', () => {
  it('accepts same-major snapshots', () => {
    expect(canReplaySnapshot('1.0.0', DECK_SCHEMA_VERSION)).toBe(true);
    expect(canReplaySnapshot('1.4.7', DECK_SCHEMA_VERSION)).toBe(
      SEMVER_COMPATIBLE('1.4.7', '1.0.0'),
    );
  });

  it('rejects different-major snapshots', () => {
    expect(canReplaySnapshot('2.0.0', DECK_SCHEMA_VERSION)).toBe(false);
    expect(canReplaySnapshot('0.9.0', DECK_SCHEMA_VERSION)).toBe(false);
  });
});

describe('defaultMigrator', () => {
  it('returns a SchemaMigrator pinned to the current version', () => {
    const m = defaultMigrator();
    expect(m.current()).toBe(DECK_SCHEMA_VERSION);
  });

  it('honours an injected registry', () => {
    const reg = new MigrationRegistry();
    reg.register({
      from: '0.9.0',
      to: '1.0.0',
      direction: 'up',
      description: 'promote',
      apply: (doc) => ({ ...(doc as object), schemaVersion: '1.0.0' }),
    });
    const m = defaultMigrator(reg);
    const deck = makeDeck({ schemaVersion: '0.9.0' }) as unknown as DeckDocument;
    const upgraded = m.apply(deck);
    expect(upgraded.schemaVersion).toBe('1.0.0');
  });
});

describe('upgradeOnRead', () => {
  it('returns the document unchanged when version is current', () => {
    const m = defaultMigrator();
    const deck = makeDeck();
    const out = upgradeOnRead(deck, m);
    expect(out).toBe(deck);
  });

  it('applies a registered migration path', () => {
    const reg = new MigrationRegistry();
    reg.register({
      from: '0.9.0',
      to: '1.0.0',
      direction: 'up',
      description: 'promote to 1.0',
      apply: (doc) => ({ ...(doc as object), schemaVersion: '1.0.0' }),
    });
    const m = defaultMigrator(reg);
    const deck = makeDeck({ schemaVersion: '0.9.0' }) as unknown as DeckDocument;
    const out = upgradeOnRead(deck, m);
    expect(out.schemaVersion).toBe('1.0.0');
  });

  it('throws NoMigrationPathError when no path exists', () => {
    const reg = new MigrationRegistry();
    const m = defaultMigrator(reg);
    const deck = makeDeck({ schemaVersion: '0.7.0' }) as unknown as DeckDocument;
    expect(() => upgradeOnRead(deck, m)).toThrow(NoMigrationPathError);
  });

  it('throws InvalidMigratedDocumentError when post-migration validation fails', () => {
    const reg = new MigrationRegistry();
    reg.register({
      from: '0.9.0',
      to: '1.0.0',
      direction: 'up',
      description: 'remove slides array',
      apply: () => ({ schemaVersion: '1.0.0' }), // intentionally broken
    });
    const m = defaultMigrator(reg);
    const deck = makeDeck({ schemaVersion: '0.9.0' }) as unknown as DeckDocument;
    expect(() => upgradeOnRead(deck, m)).toThrow(InvalidMigratedDocumentError);
  });
});
