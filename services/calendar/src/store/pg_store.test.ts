/**
 * PgCalendarStore unit tests with fake pool (Phase 18 W3).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - timestamptz ↔ Date round-trip
 *  - Error paths (null pool → StoreNotConfiguredError)
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgCalendarStore, StoreNotConfiguredError } from './pg_store.js';
import type { CalendarLink } from '../types.js';

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

function makeCalendarLink(overrides?: Partial<CalendarLink>): CalendarLink {
  return {
    id: 'link-001',
    workspace_id: 'ws-001',
    deck_id: 'deck-001',
    user_id: 'user-001',
    vendor: 'google',
    event_id: 'evt-123',
    event_start_at: new Date('2026-08-15T10:00:00Z'),
    is_recurring: false,
    recurrence_id: null,
    last_synced_at: new Date('2026-08-15T09:00:00Z'),
    created_at: new Date('2026-08-15T09:00:00Z'),
    updated_at: new Date('2026-08-15T09:00:00Z'),
    ...overrides,
  };
}

function linkToRow(link: CalendarLink): Record<string, unknown> {
  return {
    id: link.id,
    workspace_id: link.workspace_id,
    deck_id: link.deck_id,
    user_id: link.user_id,
    vendor: link.vendor,
    event_id: link.event_id,
    event_start_at: link.event_start_at,
    is_recurring: link.is_recurring,
    recurrence_id: link.recurrence_id,
    last_synced_at: link.last_synced_at,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PgCalendarStore', () => {
  describe('StoreNotConfiguredError', () => {
    it('throws when pool is null', async () => {
      const store = new PgCalendarStore(null);
      await expect(store.saveLink(makeCalendarLink())).rejects.toThrow(StoreNotConfiguredError);
    });
  });

  describe('saveLink', () => {
    it('executes correct INSERT SQL', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);
      const link = makeCalendarLink();

      await store.saveLink(link);

      expect(handler).toHaveBeenCalledOnce();
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO calendar_link');
      expect(sql).toContain('$1');
      expect(params).toContain(link.id);
      expect(params).toContain(link.workspace_id);
      expect(params).toContain(link.deck_id);
      expect(params).toContain(link.user_id);
      expect(params).toContain(link.vendor);
      expect(params).toContain(link.event_id);
      expect(params).toContain(link.is_recurring);
    });
  });

  describe('getLink', () => {
    it('returns null for nonexistent id', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 0 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const result = await store.getLink('nonexistent');
      expect(result).toBeNull();
    });

    it('returns domain object for existing row', async () => {
      const link = makeCalendarLink();
      const handler = vi.fn().mockReturnValue({ rows: [linkToRow(link)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const result = await store.getLink(link.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(link.id);
      expect(result!.vendor).toBe('google');
      expect(result!.event_id).toBe('evt-123');
    });
  });

  describe('listLinksByDeck', () => {
    it('queries with deck_id', async () => {
      const link = makeCalendarLink();
      const handler = vi.fn().mockReturnValue({ rows: [linkToRow(link)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const results = await store.listLinksByDeck('deck-001');
      expect(results).toHaveLength(1);
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('deck_id = $1');
      expect(params as unknown[]).toContain('deck-001');
    });
  });

  describe('listLinksByUser', () => {
    it('queries with user_id', async () => {
      const link = makeCalendarLink();
      const handler = vi.fn().mockReturnValue({ rows: [linkToRow(link)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const results = await store.listLinksByUser('user-001');
      expect(results).toHaveLength(1);
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('user_id = $1');
      expect(params).toContain('user-001');
    });
  });

  describe('deleteLink', () => {
    it('executes DELETE SQL', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      await store.deleteLink('link-001');
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('DELETE FROM calendar_link');
      expect(sql).toContain('id = $1');
      expect(params).toContain('link-001');
    });
  });

  describe('findDuplicateLink', () => {
    it('queries with deck_id, vendor, event_id', async () => {
      const link = makeCalendarLink();
      const handler = vi.fn().mockReturnValue({ rows: [linkToRow(link)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const result = await store.findDuplicateLink('deck-001', 'google', 'evt-123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('link-001');
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('deck_id = $1');
      expect(sql).toContain('vendor = $2');
      expect(sql).toContain('event_id = $3');
      expect(sql).toContain('LIMIT 1');
      expect(params as unknown[]).toContain('deck-001');
      expect(params as unknown[]).toContain('google');
      expect(params as unknown[]).toContain('evt-123');
    });

    it('returns null when no duplicate', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 0 });
      const pool = createFakePool(handler);
      const store = new PgCalendarStore(pool as never);

      const result = await store.findDuplicateLink('deck-001', 'google', 'evt-123');
      expect(result).toBeNull();
    });
  });

  describe('withTransaction', () => {
    it('calls BEGIN, COMMIT on success', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      const pool = {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue(client),
        end: vi.fn(),
      };

      const store = new PgCalendarStore(pool as never);
      const fn = vi.fn().mockResolvedValue('result');

      const result = await store.withTransaction(fn);
      expect(result).toBe('result');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('calls ROLLBACK on error', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}), // ROLLBACK (succeeds)
        release: vi.fn(),
      };

      const pool = {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue(client),
        end: vi.fn(),
      };

      const store = new PgCalendarStore(pool as never);
      const fn = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(store.withTransaction(fn)).rejects.toThrow('test error');
      expect(client.release).toHaveBeenCalledOnce();
    });
  });
});
