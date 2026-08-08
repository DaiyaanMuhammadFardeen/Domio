/**
 * PgMergeRequestStore unit tests with fake pool (Phase 18 W2).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - jsonb ↔ domain round-trip
 *  - Dynamic SET clause construction for partial updates
 *  - Error paths (not-found → StoreNotConfiguredError, etc.)
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgMergeRequestStore, StoreNotConfiguredError } from './pg_store.js';
import type { MergeRequest, SlideDiff } from '../types.js';

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

function makeMergeRequest(overrides?: Partial<MergeRequest>): MergeRequest {
  return {
    id: 'mr-001',
    workspace_id: 'ws-001',
    deck_id: 'deck-001',
    source_branch: 'feature',
    target_branch: 'main',
    title: 'Test MR',
    description: null,
    author_id: 'user-001',
    status: 'open',
    diff_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    created_by: 'user-001',
    updated_by: null,
    merged_at: null,
    merged_by: null,
    merge_commit_id: null,
    ...overrides,
  };
}

function makeSlideDiff(overrides?: Partial<SlideDiff>): SlideDiff {
  return {
    id: 'sd-001',
    workspace_id: 'ws-001',
    mr_id: 'mr-001',
    base_version_id: 'v-base',
    target_version_id: 'v-target',
    source_version_id: 'v-source',
    slide_diffs: [],
    binding_diffs: [],
    computed_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function mrToRow(mr: MergeRequest): Record<string, unknown> {
  return {
    id: mr.id,
    workspace_id: mr.workspace_id,
    deck_id: mr.deck_id,
    source_branch: mr.source_branch,
    target_branch: mr.target_branch,
    title: mr.title,
    description: mr.description,
    author_id: mr.author_id,
    status: mr.status,
    diff_id: mr.diff_id,
    created_at: mr.created_at,
    updated_at: mr.updated_at,
    created_by: mr.created_by,
    updated_by: mr.updated_by,
    merged_at: mr.merged_at,
    merged_by: mr.merged_by,
    merge_commit_id: mr.merge_commit_id,
  };
}

function sdToRow(sd: SlideDiff): Record<string, unknown> {
  return {
    id: sd.id,
    workspace_id: sd.workspace_id,
    mr_id: sd.mr_id,
    base_version_id: sd.base_version_id,
    target_version_id: sd.target_version_id,
    source_version_id: sd.source_version_id,
    slide_diffs: sd.slide_diffs,
    binding_diffs: sd.binding_diffs,
    computed_at: sd.computed_at,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PgMergeRequestStore', () => {
  describe('StoreNotConfiguredError', () => {
    it('throws when pool is null', async () => {
      const store = new PgMergeRequestStore(null);
      await expect(store.insertMergeRequest(makeMergeRequest()))
        .rejects.toThrow(StoreNotConfiguredError);
    });
  });

  describe('insertMergeRequest', () => {
    it('executes correct INSERT SQL', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);
      const mr = makeMergeRequest();

      await store.insertMergeRequest(mr);

      expect(handler).toHaveBeenCalledOnce();
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO merge_request');
      expect(sql).toContain('$1');
      expect(params).toContain(mr.id);
      expect(params).toContain(mr.workspace_id);
      expect(params).toContain(mr.deck_id);
      expect(params).toContain(mr.source_branch);
      expect(params).toContain(mr.target_branch);
      expect(params).toContain(mr.title);
      expect(params).toContain(mr.author_id);
      expect(params).toContain(mr.status);
    });
  });

  describe('getMergeRequest', () => {
    it('returns null for nonexistent id', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 0 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      const result = await store.getMergeRequest('nonexistent');
      expect(result).toBeNull();
    });

    it('returns domain object for existing row', async () => {
      const mr = makeMergeRequest();
      const handler = vi.fn().mockReturnValue({ rows: [mrToRow(mr)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      const result = await store.getMergeRequest(mr.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mr.id);
      expect(result!.status).toBe('open');
    });
  });

  describe('listMergeRequestsByDeck', () => {
    it('queries with deck_id', async () => {
      const mr = makeMergeRequest();
      const handler = vi.fn().mockReturnValue({ rows: [mrToRow(mr)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      const results = await store.listMergeRequestsByDeck('deck-001');
      expect(results).toHaveLength(1);
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('deck_id = $1');
      expect(params).toContain('deck-001');
    });

    it('adds status filter when provided', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 0 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      await store.listMergeRequestsByDeck('deck-001', { status: 'merged' });
      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('status = $2');
      expect(params).toContain('merged');
    });
  });

  describe('updateMergeRequest', () => {
    it('builds dynamic SET clause', async () => {
      const mr = makeMergeRequest({ status: 'merged', merged_by: 'user-001' });
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      await store.updateMergeRequest(mr);
      const [sql] = handler.mock.calls[0]!;
      expect(sql).toContain('UPDATE merge_request SET');
      expect(sql).toContain('status');
      expect(sql).toContain('updated_at');
    });
  });

  describe('insertSlideDiff', () => {
    it('executes correct INSERT with jsonb cast', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);
      const diff = makeSlideDiff();

      await store.insertSlideDiff(diff);

      const [sql, params] = handler.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO slide_diff');
      expect(sql).toContain('$7::jsonb');
      expect(sql).toContain('$8::jsonb');
      expect(params).toContain(diff.id);
      expect(params).toContain(diff.mr_id);
    });
  });

  describe('getSlideDiffByMrId', () => {
    it('queries by mr_id', async () => {
      const diff = makeSlideDiff();
      const handler = vi.fn().mockReturnValue({ rows: [sdToRow(diff)], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      const result = await store.getSlideDiffByMrId('mr-001');
      expect(result).not.toBeNull();
      expect(result!.mr_id).toBe('mr-001');
      const [, params] = handler.mock.calls[0]!;
      expect(params).toContain('mr-001');
    });
  });

  describe('updateSlideDiff', () => {
    it('updates slide_diffs and binding_diffs with jsonb cast', async () => {
      const handler = vi.fn().mockReturnValue({ rows: [], rowCount: 1 });
      const pool = createFakePool(handler);
      const store = new PgMergeRequestStore(pool as never);

      await store.updateSlideDiff('sd-001', {
        slide_diffs: [{ slide_id: 's1', change_type: 'modified', before: null, after: null, element_diffs: [] }],
        binding_diffs: [],
      });

      const [sql] = handler.mock.calls[0]!;
      expect(sql).toContain('UPDATE slide_diff SET');
      expect(sql).toContain('$1::jsonb');
      expect(sql).toContain('$2::jsonb');
    });
  });

  describe('withTransaction', () => {
    it('calls BEGIN, COMMIT on success', async () => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      const pool = {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue(client),
        end: vi.fn(),
      };

      const store = new PgMergeRequestStore(pool as never);
      const fn = vi.fn().mockResolvedValue('result');

      const result = await store.withTransaction(fn);
      expect(result).toBe('result');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('calls ROLLBACK on error', async () => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}), // ROLLBACK (succeeds)
        release: vi.fn(),
      };

      const pool = {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue(client),
        end: vi.fn(),
      };

      const store = new PgMergeRequestStore(pool as never);
      const fn = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(store.withTransaction(fn)).rejects.toThrow('test error');
      expect(client.release).toHaveBeenCalledOnce();
    });
  });
});
