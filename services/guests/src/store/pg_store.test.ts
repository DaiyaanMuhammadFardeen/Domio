/**
 * PgGuestStore unit tests with fake pool (Phase 18).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - text[] ↔ string[] round-trip
 *  - timestamptz ↔ Date round-trip
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *  - Error paths (not-found → GuestNotFoundError, etc.)
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgGuestStore, StoreNotConfiguredError } from './pg_store.js';
import { GuestNotFoundError } from '../types.js';
import type { GuestAccess, GuestMagicLink } from '../types.js';

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

function makeGuestAccess(overrides?: Partial<GuestAccess>): GuestAccess {
  return {
    guest_access_id: 'ga-001',
    workspace_id: 'ws-001',
    inviter_id: 'inviter-001',
    guest_email: 'guest@example.com',
    guest_user_id: null,
    scope_type: 'deck',
    scope_id: 'deck-001',
    capabilities: ['comment', 'suggest', 'view'],
    expires_at: new Date('2026-01-01T00:15:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    revoked_at: null,
    ...overrides,
  };
}

function makeMagicLink(overrides?: Partial<GuestMagicLink>): GuestMagicLink {
  return {
    id: 'ml-001',
    workspace_id: 'ws-001',
    guest_access_id: 'ga-001',
    token_hash: 'hash-abc123',
    expires_at: new Date('2026-01-01T00:15:00Z'),
    consumed_at: null,
    invalidated_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    created_by: 'inviter-001',
    ...overrides,
  };
}

function guestAccessToRow(ga: GuestAccess): Record<string, unknown> {
  return {
    id: ga.guest_access_id,
    workspace_id: ga.workspace_id,
    inviter_id: ga.inviter_id,
    guest_email: ga.guest_email,
    guest_user_id: ga.guest_user_id,
    scope_type: ga.scope_type,
    scope_id: ga.scope_id,
    capabilities: [...ga.capabilities],
    expires_at: ga.expires_at,
    created_at: ga.created_at,
    revoked_at: ga.revoked_at,
  };
}

function magicLinkToRow(ml: GuestMagicLink): Record<string, unknown> {
  return {
    id: ml.id,
    workspace_id: ml.workspace_id,
    guest_access_id: ml.guest_access_id,
    token_hash: ml.token_hash,
    expires_at: ml.expires_at,
    consumed_at: ml.consumed_at,
    invalidated_at: ml.invalidated_at,
    created_at: ml.created_at,
    created_by: ml.created_by,
  };
}

// ---------------------------------------------------------------------------
// StoreNotConfiguredError (nil pool)
// ---------------------------------------------------------------------------

describe('PgGuestStore — nil pool', () => {
  it('throws StoreNotConfiguredError for every method', async () => {
    const store = new PgGuestStore(null);
    const ga = makeGuestAccess();
    const ml = makeMagicLink();

    await expect(store.createGuestAccess(ga)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.createMagicLink(ml)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getGuestAccess('g')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getGuestAccessByEmail('deck', 'd', 'e')).rejects.toThrow(
      StoreNotConfiguredError,
    );
    await expect(store.getOpenMagicLinks('g')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getMagicLinkByHash('h')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.markMagicLinkConsumed('m', new Date())).rejects.toThrow(
      StoreNotConfiguredError,
    );
    await expect(store.invalidateMagicLinks('g', new Date())).rejects.toThrow(
      StoreNotConfiguredError,
    );
    await expect(store.setGuestRevoked('g', new Date())).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.markGuestUser('g', 'u')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.withTransaction(async () => {})).rejects.toThrow(StoreNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// createGuestAccess
// ---------------------------------------------------------------------------

describe('PgGuestStore — createGuestAccess', () => {
  it('issues INSERT with correct parameterized SQL', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgGuestStore(pool as any);
    const ga = makeGuestAccess();

    await store.createGuestAccess(ga);

    expect(captured).toHaveLength(1);
    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO guest_access');
    expect(q.sql).toContain('$8::text[]'); // capabilities
    expect(q.params[0]).toBe('ga-001');
    expect(q.params[3]).toBe('guest@example.com');
    expect(q.params[5]).toBe('deck');
    expect(q.params[7]).toEqual(['comment', 'suggest', 'view']);
  });
});

// ---------------------------------------------------------------------------
// getGuestAccess
// ---------------------------------------------------------------------------

describe('PgGuestStore — getGuestAccess', () => {
  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgGuestStore(pool as any);
    const result = await store.getGuestAccess('nonexistent');
    expect(result).toBeNull();
  });

  it('returns domain guest access when found', async () => {
    const ga = makeGuestAccess();
    const pool = createFakePool(() => ({ rows: [guestAccessToRow(ga)], rowCount: 1 }));
    const store = new PgGuestStore(pool as any);
    const result = await store.getGuestAccess('ga-001');
    expect(result).not.toBeNull();
    expect(result!.guest_access_id).toBe('ga-001');
    expect(result!.capabilities).toEqual(['comment', 'suggest', 'view']);
    expect(result!.expires_at).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// getGuestAccessByEmail
// ---------------------------------------------------------------------------

describe('PgGuestStore — getGuestAccessByEmail', () => {
  it('queries with scope_type, scope_id, and email', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgGuestStore(pool as any);

    await store.getGuestAccessByEmail('deck', 'deck-001', 'guest@example.com');

    const q = captured[0]!;
    expect(q.sql).toContain('scope_type = $1');
    expect(q.sql).toContain('scope_id = $2');
    expect(q.sql).toContain('guest_email = $3');
    expect(q.params).toEqual(['deck', 'deck-001', 'guest@example.com']);
  });
});

// ---------------------------------------------------------------------------
// getMagicLinkByHash
// ---------------------------------------------------------------------------

describe('PgGuestStore — getMagicLinkByHash', () => {
  it('returns magic link matching hash', async () => {
    const ml = makeMagicLink();
    const pool = createFakePool(() => ({ rows: [magicLinkToRow(ml)], rowCount: 1 }));
    const store = new PgGuestStore(pool as any);
    const result = await store.getMagicLinkByHash('hash-abc123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ml-001');
  });

  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgGuestStore(pool as any);
    expect(await store.getMagicLinkByHash('nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getOpenMagicLinks
// ---------------------------------------------------------------------------

describe('PgGuestStore — getOpenMagicLinks', () => {
  it('filters by guest_access_id with consumed_at AND invalidated_at both NULL', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgGuestStore(pool as any);

    await store.getOpenMagicLinks('ga-001');

    const q = captured[0]!;
    expect(q.sql).toContain('guest_access_id = $1');
    expect(q.sql).toContain('consumed_at IS NULL');
    expect(q.sql).toContain('invalidated_at IS NULL');
    expect(q.params).toEqual(['ga-001']);
  });
});

// ---------------------------------------------------------------------------
// markMagicLinkConsumed
// ---------------------------------------------------------------------------

describe('PgGuestStore — markMagicLinkConsumed', () => {
  it('updates consumed_at and returns', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [{ id: 'ml-001' }], rowCount: 1 };
    });
    const store = new PgGuestStore(pool as any);
    const now = new Date();

    await store.markMagicLinkConsumed('ml-001', now);

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE guest_magic_link SET consumed_at = $1');
    expect(q.params[0]).toBe(now);
    expect(q.params[1]).toBe('ml-001');
  });

  it('throws GuestNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgGuestStore(pool as any);
    await expect(store.markMagicLinkConsumed('nonexistent', new Date())).rejects.toThrow(
      GuestNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// invalidateMagicLinks
// ---------------------------------------------------------------------------

describe('PgGuestStore — invalidateMagicLinks', () => {
  it('invalidates open links for a guest access', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 2 };
    });
    const store = new PgGuestStore(pool as any);
    const now = new Date();

    await store.invalidateMagicLinks('ga-001', now);

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE guest_magic_link');
    expect(q.sql).toContain('SET invalidated_at = $1');
    expect(q.sql).toContain('guest_access_id = $2');
    expect(q.sql).toContain('consumed_at IS NULL');
    expect(q.sql).toContain('invalidated_at IS NULL');
    expect(q.params[0]).toBe(now);
    expect(q.params[1]).toBe('ga-001');
  });
});

// ---------------------------------------------------------------------------
// setGuestRevoked
// ---------------------------------------------------------------------------

describe('PgGuestStore — setGuestRevoked', () => {
  it('sets revoked_at and returns', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [{ id: 'ga-001' }], rowCount: 1 };
    });
    const store = new PgGuestStore(pool as any);
    const now = new Date();

    await store.setGuestRevoked('ga-001', now);

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE guest_access SET revoked_at = $1');
    expect(q.params[0]).toBe(now);
    expect(q.params[1]).toBe('ga-001');
  });

  it('throws GuestNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgGuestStore(pool as any);
    await expect(store.setGuestRevoked('nonexistent', new Date())).rejects.toThrow(
      GuestNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// markGuestUser
// ---------------------------------------------------------------------------

describe('PgGuestStore — markGuestUser', () => {
  it('sets guest_user_id', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [{ id: 'ga-001' }], rowCount: 1 };
    });
    const store = new PgGuestStore(pool as any);

    await store.markGuestUser('ga-001', 'user-001');

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE guest_access SET guest_user_id = $1');
    expect(q.params[0]).toBe('user-001');
    expect(q.params[1]).toBe('ga-001');
  });

  it('throws GuestNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgGuestStore(pool as any);
    await expect(store.markGuestUser('nonexistent', 'user-001')).rejects.toThrow(
      GuestNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// withTransaction
// ---------------------------------------------------------------------------

describe('PgGuestStore — withTransaction', () => {
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
    const store = new PgGuestStore(pool as any);

    const result = await store.withTransaction(async (client) => {
      await client.query('INSERT INTO guest_access (...) VALUES (...)');
      return 'done';
    });

    expect(result).toBe('done');
    expect(queries).toEqual(['BEGIN', 'INSERT INTO guest_access (...) VALUES (...)', 'COMMIT']);
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
    const store = new PgGuestStore(pool as any);

    await expect(
      store.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });
});
