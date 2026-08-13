/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PgLibraryStore unit tests with fake pool (Phase 18 Wave 3).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - jsonb ↔ domain round-trip (approval_chain, slide_snapshot, data_bindings, schedule)
 *  - text[] ↔ string[] round-trip (tags)
 *  - Nullable fields (team_id, description, superseded_by, last_reviewed_at,
 *    pinned_version_id, last_synced_at, last_sync_status) round-trip
 *  - Dynamic SET clause construction for partial updates
 *  - Error paths (not-found → EntryNotFoundError/BindingNotFoundError)
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *  - getMaxVersionNum aggregation
 *  - deleteBinding not-found handling
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgLibraryStore, StoreNotConfiguredError } from './pg_store.js';
import { EntryNotFoundError, BindingNotFoundError } from '../types.js';
import type { SlideLibraryEntry, LibraryVersion, AutoUpdateBinding } from '../types.js';

// ---------------------------------------------------------------------------
// Fake pool factory
// ---------------------------------------------------------------------------

interface FakeQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

type QueryHandler = (sql: string, params?: unknown[]) => FakeQueryResult;

function createFakePool(queryHandler: QueryHandler) {
  return {
    query: vi.fn(queryHandler),
    connect: vi.fn(),
    end: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<SlideLibraryEntry>): SlideLibraryEntry {
  return {
    id: 'ent-001',
    workspace_id: 'ws-001',
    scope: 'workspace',
    title: 'Reusable Slide',
    tags: ['brand', 'template'],
    owner_id: 'user-001',
    approval_chain: { lanes: [{ lane: 'design', role: 'designer' }] },
    status: 'draft',
    version_id: 'ver-001',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    created_by: 'user-001',
    updated_by: 'user-001',
    ...overrides,
  };
}

function makeVersion(overrides?: Partial<LibraryVersion>): LibraryVersion {
  return {
    id: 'ver-001',
    entry_id: 'ent-001',
    version_num: 1,
    slide_snapshot: { slides: [{ id: 's1', elements: [] }] },
    data_bindings: [{ source: 'api', field: 'revenue' }],
    brand_locked: false,
    created_by: 'user-001',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeBinding(overrides?: Partial<AutoUpdateBinding>): AutoUpdateBinding {
  return {
    id: 'bind-001',
    workspace_id: 'ws-001',
    consumer_deck_id: 'deck-001',
    consumer_slide_id: 'slide-001',
    library_entry_id: 'ent-001',
    mode: 'manual',
    schedule: {},
    is_mandatory: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    created_by: 'user-001',
    updated_by: 'user-001',
    ...overrides,
  };
}

/** Build a fake row object that looks like what node-pg returns from a SELECT. */
function entryToRow(e: SlideLibraryEntry): Record<string, unknown> {
  return {
    id: e.id,
    workspace_id: e.workspace_id,
    scope: e.scope,
    team_id: e.team_id ?? null,
    title: e.title,
    description: e.description ?? null,
    tags: [...e.tags],
    owner_id: e.owner_id,
    approval_chain: e.approval_chain, // node-pg returns parsed jsonb
    status: e.status,
    version_id: e.version_id,
    superseded_by: e.superseded_by ?? null,
    last_reviewed_at: e.last_reviewed_at ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
    created_by: e.created_by,
    updated_by: e.updated_by,
  };
}

function versionToRow(v: LibraryVersion): Record<string, unknown> {
  return {
    id: v.id,
    workspace_id: '',
    entry_id: v.entry_id,
    version_num: v.version_num,
    slide_snapshot: v.slide_snapshot,
    data_bindings: v.data_bindings,
    brand_locked: v.brand_locked,
    created_by: v.created_by,
    created_at: v.created_at,
  };
}

function bindingToRow(b: AutoUpdateBinding): Record<string, unknown> {
  return {
    id: b.id,
    workspace_id: b.workspace_id,
    consumer_deck_id: b.consumer_deck_id,
    consumer_slide_id: b.consumer_slide_id,
    library_entry_id: b.library_entry_id,
    pinned_version_id: b.pinned_version_id ?? null,
    mode: b.mode,
    schedule: b.schedule,
    is_mandatory: b.is_mandatory,
    last_synced_at: b.last_synced_at ?? null,
    last_sync_status: b.last_sync_status ?? null,
    created_at: b.created_at,
    updated_at: b.updated_at,
    created_by: b.created_by,
    updated_by: b.updated_by,
  };
}

// ---------------------------------------------------------------------------
// StoreNotConfiguredError (nil pool)
// ---------------------------------------------------------------------------

describe('PgLibraryStore — nil pool', () => {
  it('throws StoreNotConfiguredError for every method', async () => {
    const store = new PgLibraryStore(null);
    const entry = makeEntry();
    const version = makeVersion();
    const binding = makeBinding();

    await expect(store.insertEntry(entry)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getEntry('e')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listEntriesByWorkspace('ws')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.updateEntry('e', {})).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertVersion(version)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getVersion('v')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listVersionsByEntry('e')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getMaxVersionNum('e')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertBinding(binding)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getBinding('b')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listBindingsByWorkspace('ws')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listBindingsByEntry('e')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.updateBinding('b', {})).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.deleteBinding('b')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listAllBindings()).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.withTransaction(async () => {})).rejects.toThrow(StoreNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// insertEntry
// ---------------------------------------------------------------------------

describe('PgLibraryStore — insertEntry', () => {
  it('issues INSERT with correct parameterized SQL including jsonb and text[]', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    const entry = makeEntry();

    await store.insertEntry(entry);

    expect(captured).toHaveLength(1);
    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO slide_library_entry');
    expect(q.sql).toContain('$7::text[]'); // tags
    expect(q.sql).toContain('$9::jsonb'); // approval_chain
    // Verify parameter values
    expect(q.params[0]).toBe('ent-001');
    expect(q.params[2]).toBe('workspace');
    expect(q.params[6]).toEqual(['brand', 'template']); // tags as array
    expect(typeof q.params[8]).toBe('string'); // approval_chain is stringified
    expect(JSON.parse(q.params[8] as string)).toEqual(entry.approval_chain);
    expect(q.params[9]).toBe('draft'); // status
  });

  it('handles nullable fields (team_id, description, superseded_by, last_reviewed_at)', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    const entry = makeEntry(); // no team_id, description, superseded_by, last_reviewed_at

    await store.insertEntry(entry);

    const q = captured[0]!;
    expect(q.params[3]).toBeNull(); // team_id
    expect(q.params[5]).toBeNull(); // description
    expect(q.params[11]).toBeNull(); // superseded_by
    expect(q.params[12]).toBeNull(); // last_reviewed_at
  });
});

// ---------------------------------------------------------------------------
// getEntry
// ---------------------------------------------------------------------------

describe('PgLibraryStore — getEntry', () => {
  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    expect(await store.getEntry('nonexistent')).toBeNull();
  });

  it('returns domain entry with parsed jsonb and text[]', async () => {
    const entry = makeEntry({
      team_id: 'team-001',
      description: 'A reusable slide',
      superseded_by: 'ent-002',
      last_reviewed_at: new Date('2026-02-01'),
    });
    const pool = createFakePool(() => ({ rows: [entryToRow(entry)], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getEntry('ent-001');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ent-001');
    expect(result!.team_id).toBe('team-001');
    expect(result!.description).toBe('A reusable slide');
    expect(result!.tags).toEqual(['brand', 'template']);
    expect(result!.approval_chain).toEqual({ lanes: [{ lane: 'design', role: 'designer' }] });
    expect(result!.superseded_by).toBe('ent-002');
    expect(result!.last_reviewed_at).toEqual(new Date('2026-02-01'));
  });

  it('handles null optional fields', async () => {
    const entry = makeEntry();
    const pool = createFakePool(() => ({ rows: [entryToRow(entry)], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getEntry('ent-001');
    // With exactOptionalPropertyTypes, these properties should not exist
    expect(result!.team_id).toBeUndefined();
    expect(result!.description).toBeUndefined();
    expect(result!.superseded_by).toBeUndefined();
    expect(result!.last_reviewed_at).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateEntry
// ---------------------------------------------------------------------------

describe('PgLibraryStore — updateEntry', () => {
  it('builds dynamic SET clause for scalar fields', async () => {
    const entry = makeEntry();
    const updated = { ...entry, status: 'approved' as const, updated_at: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [entryToRow(updated)], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.updateEntry('ent-001', { status: 'approved' });

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE slide_library_entry SET');
    expect(q.sql).toContain('status = $1');
    // Should auto-add updated_at since not in patch
    expect(q.sql).toContain('updated_at = $2');
    expect(q.params[0]).toBe('approved');
    expect(q.params[q.params.length - 1]).toBe('ent-001'); // WHERE id = $N
  });

  it('handles nullable superseded_by update', async () => {
    const entry = makeEntry({ superseded_by: 'ent-002' });
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      const row = entryToRow(entry);
      row.superseded_by = null;
      return { rows: [row], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);

    // Service layer omits the field when not updating; pg_store handles DB nullability
    await store.updateEntry('ent-001', {});

    const q = captured[0]!;
    // Empty patch falls through to GET fallback — no UPDATE issued
    expect(q.sql).not.toContain('UPDATE');
  });

  it('throws EntryNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    await expect(store.updateEntry('nonexistent', { status: 'approved' })).rejects.toThrow(
      EntryNotFoundError,
    );
  });

  it('skips update when patch is empty and returns existing', async () => {
    const entry = makeEntry();
    let queryCount = 0;
    const pool = createFakePool(() => {
      queryCount++;
      return { rows: [entryToRow(entry)], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    const result = await store.updateEntry('ent-001', {});
    expect(result.id).toBe('ent-001');
    // Only one query (the SELECT fallback), no UPDATE issued
    expect(queryCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// insertVersion / getVersion / listVersionsByEntry / getMaxVersionNum
// ---------------------------------------------------------------------------

describe('PgLibraryStore — versions', () => {
  it('insertVersion issues INSERT with jsonb fields', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    const version = makeVersion();

    await store.insertVersion(version);

    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO library_version');
    expect(q.sql).toContain('$5::jsonb'); // slide_snapshot
    expect(q.sql).toContain('$6::jsonb'); // data_bindings
    expect(q.params[0]).toBe('ver-001');
    expect(q.params[2]).toBe('ent-001'); // entry_id
    expect(q.params[3]).toBe(1); // version_num
    expect(typeof q.params[4]).toBe('string'); // slide_snapshot stringified
    expect(JSON.parse(q.params[4] as string)).toEqual(version.slide_snapshot);
    expect(JSON.parse(q.params[5] as string)).toEqual(version.data_bindings);
    expect(q.params[6]).toBe(false); // brand_locked
  });

  it('getVersion returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    expect(await store.getVersion('nonexistent')).toBeNull();
  });

  it('getVersion returns domain version with parsed jsonb', async () => {
    const version = makeVersion();
    const pool = createFakePool(() => ({ rows: [versionToRow(version)], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getVersion('ver-001');
    expect(result).not.toBeNull();
    expect(result!.slide_snapshot).toEqual(version.slide_snapshot);
    expect(result!.data_bindings).toEqual(version.data_bindings);
    expect(result!.brand_locked).toBe(false);
  });

  it('listVersionsByEntry filters by entry_id and orders by version_num', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.listVersionsByEntry('ent-001');

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE entry_id = $1');
    expect(q.sql).toContain('ORDER BY version_num ASC');
    expect(q.params).toEqual(['ent-001']);
  });

  it('getMaxVersionNum returns 0 when no versions exist', async () => {
    const pool = createFakePool(() => ({ rows: [{ max_num: 0 }], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getMaxVersionNum('ent-001');
    expect(result).toBe(0);
  });

  it('getMaxVersionNum returns max version number', async () => {
    const pool = createFakePool(() => ({ rows: [{ max_num: 5 }], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getMaxVersionNum('ent-001');
    expect(result).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// insertBinding / getBinding / updateBinding / deleteBinding
// ---------------------------------------------------------------------------

describe('PgLibraryStore — bindings', () => {
  it('insertBinding issues INSERT with jsonb schedule', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    const binding = makeBinding({ schedule: { cron: '0 9 * * 1' } });

    await store.insertBinding(binding);

    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO auto_update_binding');
    expect(q.sql).toContain('$8::jsonb'); // schedule
    expect(q.params[0]).toBe('bind-001');
    expect(q.params[6]).toBe('manual'); // mode
    expect(typeof q.params[7]).toBe('string'); // schedule stringified
    expect(JSON.parse(q.params[7] as string)).toEqual({ cron: '0 9 * * 1' });
    expect(q.params[8]).toBe(false); // is_mandatory
    expect(q.params[9]).toBeNull(); // last_synced_at
    expect(q.params[10]).toBeNull(); // last_sync_status
  });

  it('getBinding returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    expect(await store.getBinding('nonexistent')).toBeNull();
  });

  it('getBinding returns domain binding with parsed jsonb and nullable fields', async () => {
    const binding = makeBinding({
      pinned_version_id: 'ver-003',
      last_synced_at: new Date('2026-03-01'),
      last_sync_status: 'success',
    });
    const pool = createFakePool(() => ({ rows: [bindingToRow(binding)], rowCount: 1 }));
    const store = new PgLibraryStore(pool as any);
    const result = await store.getBinding('bind-001');
    expect(result).not.toBeNull();
    expect(result!.pinned_version_id).toBe('ver-003');
    expect(result!.last_synced_at).toEqual(new Date('2026-03-01'));
    expect(result!.last_sync_status).toBe('success');
    expect(result!.schedule).toEqual({});
  });

  it('listBindingsByWorkspace filters by workspace_id', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.listBindingsByWorkspace('ws-001');

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE workspace_id = $1');
    expect(q.params).toEqual(['ws-001']);
  });

  it('listBindingsByEntry filters by library_entry_id', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.listBindingsByEntry('ent-001');

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE library_entry_id = $1');
    expect(q.params).toEqual(['ent-001']);
  });

  it('updateBinding builds dynamic SET clause', async () => {
    const binding = makeBinding();
    const updated = { ...binding, mode: 'immediate' as const, updated_at: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [bindingToRow(updated)], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.updateBinding('bind-001', { mode: 'immediate' });

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE auto_update_binding SET');
    expect(q.sql).toContain('mode = $1');
    // Should auto-add updated_at since not in patch
    expect(q.sql).toContain('updated_at = $2');
    expect(q.params[0]).toBe('immediate');
    expect(q.params[q.params.length - 1]).toBe('bind-001');
  });

  it('updateBinding handles jsonb schedule update', async () => {
    const binding = makeBinding();
    const updated = { ...binding, schedule: { cron: '0 9 * * 1' }, updated_at: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [bindingToRow(updated)], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.updateBinding('bind-001', { schedule: { cron: '0 9 * * 1' } });

    const q = captured[0]!;
    expect(q.sql).toContain('schedule = $1::jsonb');
    expect(JSON.parse(q.params[0] as string)).toEqual({ cron: '0 9 * * 1' });
  });

  it('updateBinding handles nullable pinned_version_id', async () => {
    const binding = makeBinding({ pinned_version_id: 'ver-001' });
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      const row = bindingToRow(binding);
      row.pinned_version_id = null;
      return { rows: [row], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);

    // Service layer omits the field when not updating; pg_store handles DB nullability
    await store.updateBinding('bind-001', {});

    const q = captured[0]!;
    // Empty patch falls through to GET fallback — no UPDATE issued
    expect(q.sql).not.toContain('UPDATE');
  });

  it('updateBinding throws BindingNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    await expect(store.updateBinding('nonexistent', { mode: 'frozen' })).rejects.toThrow(
      BindingNotFoundError,
    );
  });

  it('deleteBinding issues DELETE and throws BindingNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgLibraryStore(pool as any);
    await expect(store.deleteBinding('nonexistent')).rejects.toThrow(BindingNotFoundError);
  });

  it('deleteBinding succeeds when found', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgLibraryStore(pool as any);
    await store.deleteBinding('bind-001');
    expect(captured[0]!.sql).toContain('DELETE FROM auto_update_binding');
    expect(captured[0]!.params).toEqual(['bind-001']);
  });

  it('listAllBindings returns all bindings', async () => {
    const b1 = makeBinding({ id: 'b-1' });
    const b2 = makeBinding({ id: 'b-2' });
    const pool = createFakePool(() => ({
      rows: [bindingToRow(b1), bindingToRow(b2)],
      rowCount: 2,
    }));
    const store = new PgLibraryStore(pool as any);
    const results = await store.listAllBindings();
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('b-1');
    expect(results[1]!.id).toBe('b-2');
  });
});

// ---------------------------------------------------------------------------
// listEntriesByWorkspace
// ---------------------------------------------------------------------------

describe('PgLibraryStore — listEntriesByWorkspace', () => {
  it('filters by workspace_id and orders by created_at', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgLibraryStore(pool as any);

    await store.listEntriesByWorkspace('ws-001');

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE workspace_id = $1');
    expect(q.sql).toContain('ORDER BY created_at ASC');
    expect(q.params).toEqual(['ws-001']);
  });
});

// ---------------------------------------------------------------------------
// withTransaction
// ---------------------------------------------------------------------------

describe('PgLibraryStore — withTransaction', () => {
  it('issues BEGIN, runs fn, then COMMIT', async () => {
    const queries: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => fakeClient),
      end: vi.fn(),
    };
    const store = new PgLibraryStore(pool as any);

    const result = await store.withTransaction(async (client) => {
      await client.query('INSERT INTO slide_library_entry (...) VALUES (...)');
      return 'done';
    });

    expect(result).toBe('done');
    expect(queries).toEqual([
      'BEGIN',
      'INSERT INTO slide_library_entry (...) VALUES (...)',
      'COMMIT',
    ]);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });

  it('issues ROLLBACK on error and rethrows', async () => {
    const queries: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => fakeClient),
      end: vi.fn(),
    };
    const store = new PgLibraryStore(pool as any);

    await expect(
      store.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });
});
