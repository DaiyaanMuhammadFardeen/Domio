/**
 * PgExpiryStore unit tests with fake pool (Phase 18).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - Policy upsert via ON CONFLICT
 *  - Flag insert, listOpenFlags with filters, resolveFlags, getFlagHistory
 *  - Nullable fields (resolved_at, resolved_by, responsible_id) round-trip
 *  - Error paths (not-found → null, StoreNotConfiguredError)
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgExpiryStore, StoreNotConfiguredError } from './pg_store.js';
import type { ExpiryPolicy, FreshnessFlag } from '../types.js';

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

function makePolicy(overrides?: Partial<ExpiryPolicy>): ExpiryPolicy {
  return {
    id: 'pol-001',
    workspace_id: 'ws-001',
    resource_type: 'deck',
    resource_id: 'deck-001',
    interval_days: 90,
    responsible_id: 'user-001',
    escalation: 'gentle',
    auto_revoke_share: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    created_by: 'user-001',
    updated_by: 'user-001',
    ...overrides,
  };
}

function makeFlag(overrides?: Partial<FreshnessFlag>): FreshnessFlag {
  return {
    id: 'flag-001',
    workspace_id: 'ws-001',
    resource_type: 'deck',
    resource_id: 'deck-001',
    flagged_at: new Date('2026-01-15T00:00:00Z'),
    reason: 'policy_overdue',
    resolved_at: null,
    resolved_by: null,
    created_at: new Date('2026-01-15T00:00:00Z'),
    ...overrides,
  };
}

/** Build a fake row object that looks like what node-pg returns from a SELECT. */
function policyToRow(p: ExpiryPolicy): Record<string, unknown> {
  return {
    id: p.id,
    workspace_id: p.workspace_id,
    resource_type: p.resource_type,
    resource_id: p.resource_id,
    interval_days: p.interval_days,
    responsible_id: p.responsible_id,
    escalation: p.escalation,
    auto_revoke_share: p.auto_revoke_share,
    created_at: p.created_at,
    created_by: p.created_by,
    updated_by: p.updated_by,
  };
}

function flagToRow(f: FreshnessFlag): Record<string, unknown> {
  return {
    id: f.id,
    workspace_id: f.workspace_id,
    resource_type: f.resource_type,
    resource_id: f.resource_id,
    flagged_at: f.flagged_at,
    reason: f.reason,
    resolved_at: f.resolved_at,
    resolved_by: f.resolved_by,
    created_at: f.created_at,
  };
}

// ---------------------------------------------------------------------------
// StoreNotConfiguredError (nil pool)
// ---------------------------------------------------------------------------

describe('PgExpiryStore — nil pool', () => {
  it('throws StoreNotConfiguredError for every method', async () => {
    const store = new PgExpiryStore(null);
    const policy = makePolicy();
    const flag = makeFlag();

    await expect(store.upsertPolicy(policy)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getPolicy('deck', 'id')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listPolicies('ws')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertFlag(flag)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listOpenFlags()).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.resolveFlags('deck', 'id', { resolvedAt: new Date(), resolvedBy: 'u' })).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getFlagHistory('deck', 'id')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.withTransaction(async () => {})).rejects.toThrow(StoreNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// upsertPolicy
// ---------------------------------------------------------------------------

describe('PgExpiryStore — upsertPolicy', () => {
  it('issues INSERT with ON CONFLICT and correct parameterized SQL', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgExpiryStore(pool as any);
    const policy = makePolicy();

    await store.upsertPolicy(policy);

    expect(captured).toHaveLength(1);
    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO expiry_policy');
    expect(q.sql).toContain('ON CONFLICT (resource_type, resource_id) DO UPDATE');
    // Verify parameter values
    expect(q.params[0]).toBe('pol-001');
    expect(q.params[2]).toBe('deck');
    expect(q.params[3]).toBe('deck-001');
    expect(q.params[4]).toBe(90);
    expect(q.params[6]).toBe('gentle');
    expect(q.params[7]).toBe(false);
  });

  it('upserts with nullable responsible_id', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgExpiryStore(pool as any);
    const policy = makePolicy({ responsible_id: null });

    await store.upsertPolicy(policy);

    const q = captured[0]!;
    expect(q.params[5]).toBeNull(); // responsible_id
  });
});

// ---------------------------------------------------------------------------
// getPolicy
// ---------------------------------------------------------------------------

describe('PgExpiryStore — getPolicy', () => {
  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgExpiryStore(pool as any);
    const result = await store.getPolicy('deck', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns domain policy when found', async () => {
    const policy = makePolicy();
    const pool = createFakePool(() => ({ rows: [policyToRow(policy)], rowCount: 1 }));
    const store = new PgExpiryStore(pool as any);
    const result = await store.getPolicy('deck', 'deck-001');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pol-001');
    expect(result!.interval_days).toBe(90);
    expect(result!.escalation).toBe('gentle');
    expect(result!.auto_revoke_share).toBe(false);
    expect(result!.responsible_id).toBe('user-001');
  });

  it('handles nullable responsible_id', async () => {
    const policy = makePolicy({ responsible_id: null });
    const pool = createFakePool(() => ({ rows: [policyToRow(policy)], rowCount: 1 }));
    const store = new PgExpiryStore(pool as any);
    const result = await store.getPolicy('deck', 'deck-001');
    expect(result!.responsible_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPolicies
// ---------------------------------------------------------------------------

describe('PgExpiryStore — listPolicies', () => {
  it('filters by workspace_id and orders by created_at', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgExpiryStore(pool as any);

    await store.listPolicies('ws-001');

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE workspace_id = $1');
    expect(q.sql).toContain('ORDER BY created_at ASC');
    expect(q.params).toEqual(['ws-001']);
  });

  it('returns multiple policies', async () => {
    const p1 = makePolicy({ id: 'pol-1', resource_id: 'd-1' });
    const p2 = makePolicy({ id: 'pol-2', resource_id: 'd-2' });
    const pool = createFakePool(() => ({
      rows: [policyToRow(p1), policyToRow(p2)],
      rowCount: 2,
    }));
    const store = new PgExpiryStore(pool as any);
    const results = await store.listPolicies('ws-001');
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('pol-1');
    expect(results[1]!.id).toBe('pol-2');
  });
});

// ---------------------------------------------------------------------------
// insertFlag
// ---------------------------------------------------------------------------

describe('PgExpiryStore — insertFlag', () => {
  it('issues INSERT with correct parameterized SQL', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgExpiryStore(pool as any);
    const flag = makeFlag();

    await store.insertFlag(flag);

    expect(captured).toHaveLength(1);
    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO freshness_flag');
    expect(q.params[0]).toBe('flag-001');
    expect(q.params[4]).toEqual(new Date('2026-01-15T00:00:00Z')); // flagged_at
    expect(q.params[5]).toBe('policy_overdue');
    expect(q.params[6]).toBeNull(); // resolved_at
    expect(q.params[7]).toBeNull(); // resolved_by
  });

  it('inserts flag with resolved_at and resolved_by', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgExpiryStore(pool as any);
    const flag = makeFlag({
      resolved_at: new Date('2026-01-20T00:00:00Z'),
      resolved_by: 'user-002',
    });

    await store.insertFlag(flag);

    const q = captured[0]!;
    expect(q.params[6]).toEqual(new Date('2026-01-20T00:00:00Z'));
    expect(q.params[7]).toBe('user-002');
  });
});

// ---------------------------------------------------------------------------
// listOpenFlags
// ---------------------------------------------------------------------------

describe('PgExpiryStore — listOpenFlags', () => {
  it('issues SELECT with resolved_at IS NULL filter', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgExpiryStore(pool as any);

    await store.listOpenFlags();

    const q = captured[0]!;
    expect(q.sql).toContain('resolved_at IS NULL');
    expect(q.params).toEqual([]);
  });

  it('adds resource_type filter', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgExpiryStore(pool as any);

    await store.listOpenFlags('deck');

    const q = captured[0]!;
    expect(q.sql).toContain('resource_type = $1');
    expect(q.params).toEqual(['deck']);
  });

  it('adds both resource_type and resource_id filters', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgExpiryStore(pool as any);

    await store.listOpenFlags('deck', 'deck-001');

    const q = captured[0]!;
    expect(q.sql).toContain('resource_type = $1');
    expect(q.sql).toContain('resource_id = $2');
    expect(q.params).toEqual(['deck', 'deck-001']);
  });

  it('returns domain flags with nullable resolved_at', async () => {
    const flag = makeFlag();
    const pool = createFakePool(() => ({
      rows: [flagToRow(flag)],
      rowCount: 1,
    }));
    const store = new PgExpiryStore(pool as any);
    const results = await store.listOpenFlags();
    expect(results).toHaveLength(1);
    expect(results[0]!.resolved_at).toBeNull();
    expect(results[0]!.resolved_by).toBeNull();
    expect(results[0]!.reason).toBe('policy_overdue');
  });
});

// ---------------------------------------------------------------------------
// resolveFlags
// ---------------------------------------------------------------------------

describe('PgExpiryStore — resolveFlags', () => {
  it('issues UPDATE and returns affected row count', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 3 };
    });
    const store = new PgExpiryStore(pool as any);

    const resolvedAt = new Date('2026-01-20T00:00:00Z');
    const count = await store.resolveFlags('deck', 'deck-001', {
      resolvedAt,
      resolvedBy: 'user-002',
    });

    expect(count).toBe(3);
    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE freshness_flag');
    expect(q.sql).toContain('resolved_at = $1');
    expect(q.sql).toContain('resolved_by = $2');
    expect(q.sql).toContain('resource_type = $3');
    expect(q.sql).toContain('resource_id = $4');
    expect(q.sql).toContain('resolved_at IS NULL');
    expect(q.params[0]).toEqual(resolvedAt);
    expect(q.params[1]).toBe('user-002');
    expect(q.params[2]).toBe('deck');
    expect(q.params[3]).toBe('deck-001');
  });

  it('returns 0 when no rows match', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgExpiryStore(pool as any);
    const count = await store.resolveFlags('deck', 'nonexistent', {
      resolvedAt: new Date(),
      resolvedBy: 'user',
    });
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getFlagHistory
// ---------------------------------------------------------------------------

describe('PgExpiryStore — getFlagHistory', () => {
  it('filters by resource_type and resource_id', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgExpiryStore(pool as any);

    await store.getFlagHistory('deck', 'deck-001');

    const q = captured[0]!;
    expect(q.sql).toContain('resource_type = $1');
    expect(q.sql).toContain('resource_id = $2');
    expect(q.sql).toContain('ORDER BY created_at ASC');
    expect(q.params).toEqual(['deck', 'deck-001']);
  });

  it('returns all flags including resolved ones', async () => {
    const f1 = makeFlag({ id: 'f-1', resolved_at: null });
    const f2 = makeFlag({ id: 'f-2', resolved_at: new Date('2026-01-20'), resolved_by: 'user-002' });
    const pool = createFakePool(() => ({
      rows: [flagToRow(f1), flagToRow(f2)],
      rowCount: 2,
    }));
    const store = new PgExpiryStore(pool as any);
    const results = await store.getFlagHistory('deck', 'deck-001');
    expect(results).toHaveLength(2);
    expect(results[0]!.resolved_at).toBeNull();
    expect(results[1]!.resolved_at).toEqual(new Date('2026-01-20'));
  });
});

// ---------------------------------------------------------------------------
// withTransaction
// ---------------------------------------------------------------------------

describe('PgExpiryStore — withTransaction', () => {
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
    const store = new PgExpiryStore(pool as any);

    const result = await store.withTransaction(async (client) => {
      await client.query('INSERT INTO expiry_policy (...) VALUES (...)');
      return 'done';
    });

    expect(result).toBe('done');
    expect(queries).toEqual(['BEGIN', 'INSERT INTO expiry_policy (...) VALUES (...)', 'COMMIT']);
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
    const store = new PgExpiryStore(pool as any);

    await expect(
      store.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });
});
