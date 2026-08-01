import { describe, it, expect } from 'vitest';
import { DECK_SCHEMA_VERSION } from './version.js';
import { MigrationRegistry } from './registry.js';
import { SchemaMigrator } from './migrate.js';
import type { DeckDocument } from './generated/scene-graph.js';
import { asULID } from './generated/scene-graph.js';

const deck: DeckDocument = {
  schemaVersion: '1.0.0',
  id: asULID('01H00000000000000000000000'),
  tenantId: 'tenant',
  workspaceId: asULID('01H00000000000000000000001'),
  title: 'Migration fixture',
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

describe('SchemaMigrator', () => {
  it('is idempotent when a document is already current', () => {
    const migrator = new SchemaMigrator(DECK_SCHEMA_VERSION);
    expect(migrator.plan(deck).steps).toBe(0);
    expect(migrator.apply(deck)).toEqual(deck);
  });

  it('applies a registered migration path', () => {
    const registry = new MigrationRegistry();
    registry.register({
      from: '0.9.0',
      to: '1.0.0',
      direction: 'up',
      description: 'Rename legacy fields',
      apply: (document) => ({ ...(document as DeckDocument), title: 'Migrated' }),
    });
    const migrator = new SchemaMigrator('1.0.0', registry);
    const migrated = migrator.apply({ ...deck, schemaVersion: '0.9.0' });
    expect(migrated.schemaVersion).toBe('1.0.0');
    expect(migrated.title).toBe('Migrated');
  });

  it('fails explicitly when no migration path exists', () => {
    const migrator = new SchemaMigrator('1.0.0');
    expect(() => migrator.apply({ ...deck, schemaVersion: '2.0.0' })).toThrow(
      'No schema migration path',
    );
  });
});

describe('MigrationRegistry', () => {
  it('finds multi-hop paths', () => {
    const registry = new MigrationRegistry();
    registry.register({
      from: '1.0.0',
      to: '1.1.0',
      direction: 'up',
      description: 'first',
      apply: (document) => document,
    });
    registry.register({
      from: '1.1.0',
      to: '1.2.0',
      direction: 'up',
      description: 'second',
      apply: (document) => document,
    });
    expect(registry.findPath('1.0.0', '1.2.0')).toHaveLength(2);
  });
});
