/**
 * PgMarketplaceStore tests (Phase 19 Wave 1).
 *
 * Fake-pool unit tests (~8-12 tests) verifying SQL construction
 * and error paths without a real database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgMarketplaceStore, StoreNotConfiguredError } from './pg_store.js';
import type { MarketplaceListing } from '../types.js';

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: overrides.id ?? 'listing-1',
    catalogId: overrides.catalogId ?? 'comp-1',
    sellerId: overrides.sellerId ?? 'seller-1',
    title: overrides.title ?? 'Test Component',
    description: overrides.description ?? 'A test component',
    status: overrides.status ?? 'draft',
    isFree: overrides.isFree ?? true,
    priceCents: overrides.priceCents ?? null,
    currency: overrides.currency ?? null,
    tags: overrides.tags ?? [],
    preview: overrides.preview ?? null,
    publishedAtMs: overrides.publishedAtMs ?? null,
    deprecatedAtMs: overrides.deprecatedAtMs ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function createFakePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
    }),
  };
}

describe('PgMarketplaceStore', () => {
  // -------------------------------------------------------------------------
  // StoreNotConfiguredError (null pool)
  // -------------------------------------------------------------------------

  describe('null pool', () => {
    const store = new PgMarketplaceStore(null);

    it('insertListing throws StoreNotConfiguredError', async () => {
      await expect(store.insertListing(makeListing())).rejects.toThrow(StoreNotConfiguredError);
    });

    it('getListing throws StoreNotConfiguredError', async () => {
      await expect(store.getListing('x')).rejects.toThrow(StoreNotConfiguredError);
    });

    it('getPayoutPolicy throws StoreNotConfiguredError', async () => {
      await expect(store.getPayoutPolicy()).rejects.toThrow(StoreNotConfiguredError);
    });

    it('insertAuditEvent throws StoreNotConfiguredError', async () => {
      await expect(store.insertAuditEvent({
        id: 'e1', workspaceId: 'ws1', actorId: 'u1',
        actorType: 'user', actorKind: 'human',
        eventKind: 'purchase', eventType: 'purchase',
        payload: {}, seq: 1, prevHash: '', hash: 'h', kid: 'mk1',
        recordedAt: new Date(),
      })).rejects.toThrow(StoreNotConfiguredError);
    });

    it('withTransaction throws StoreNotConfiguredError', async () => {
      await expect(store.withTransaction(async () => 42)).rejects.toThrow(StoreNotConfiguredError);
    });

    it('insertListingVersion throws StoreNotConfiguredError (no table)', async () => {
      await expect(store.insertListingVersion({
        id: 'v1', listingId: 'l1', catalogId: 'c1', version: '1.0', createdAt: new Date(),
      })).rejects.toThrow(StoreNotConfiguredError);
    });

    it('listListingVersions throws StoreNotConfiguredError (no table)', async () => {
      await expect(store.listListingVersions('c1')).rejects.toThrow(StoreNotConfiguredError);
    });
  });

  // -------------------------------------------------------------------------
  // Fake pool DML tests
  // -------------------------------------------------------------------------

  describe('fake pool', () => {
    let pool: ReturnType<typeof createFakePool>;
    let store: PgMarketplaceStore;

    beforeEach(() => {
      pool = createFakePool();
      store = new PgMarketplaceStore(pool as never);
    });

    it('insertListing calls pool.query with INSERT SQL', async () => {
      await store.insertListing(makeListing());
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql] = pool.query.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO marketplace_listing');
      expect(sql).toContain('$1');
    });

    it('getListing calls pool.query with SELECT SQL', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await store.getListing('listing-1');
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0]!;
      expect(sql).toContain('SELECT * FROM marketplace_listing WHERE id = $1');
      expect(params).toEqual(['listing-1']);
    });

    it('getListing returns null when no rows', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const result = await store.getListing('nonexistent');
      expect(result).toBeNull();
    });

    it('listListings builds WHERE clause with status filter', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await store.listListings({ status: 'published' });
      const [sql, params] = pool.query.mock.calls[0]!;
      expect(sql).toContain("status = $1");
      expect(params).toContain('published');
    });

    it('updateListing builds dynamic SET clause', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'listing-1', catalog_id: 'c1', seller_id: 's1', title: 'Updated',
          description: '', status: 'draft', is_free: true, price_cents: null,
          currency: null, tags: '[]', preview: null, published_at_ms: null,
          deprecated_at_ms: null, created_at: new Date(), updated_at: new Date() }],
      });
      await store.updateListing('listing-1', { title: 'Updated' });
      const [sql] = pool.query.mock.calls[0]!;
      expect(sql).toContain('UPDATE marketplace_listing SET');
      expect(sql).toContain('title = $1');
    });

    it('getPayoutPolicy returns defaults when no rows', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const policy = await store.getPayoutPolicy();
      expect(policy.splitCreatorBps).toBe(7000);
      expect(policy.splitPlatformBps).toBe(3000);
    });

    it('getPayoutPolicy maps row to domain', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'pp1', split_creator_bps: 8000, split_platform_bps: 2000,
          min_payout_cents: 10000, first_payout_hold_days: 60,
          updated_at: new Date(), updated_by: null,
        }],
      });
      const policy = await store.getPayoutPolicy();
      expect(policy.splitCreatorBps).toBe(8000);
      expect(policy.splitPlatformBps).toBe(2000);
      expect(policy.minPayoutCents).toBe(10000);
      expect(policy.firstPayoutHoldDays).toBe(60);
    });

    it('getNextAuditSeq queries MAX(seq)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ next_seq: 5 }] });
      const seq = await store.getNextAuditSeq('ws1', 'purchase');
      expect(seq).toBe(5);
      const [sql, params] = pool.query.mock.calls[0]!;
      expect(sql).toContain('COALESCE(MAX(seq), 0) + 1');
      expect(params).toEqual(['ws1', 'purchase']);
    });

    it('getLastAuditHash returns hash string', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ hash: 'abc123' }] });
      const hash = await store.getLastAuditHash('ws1', 'purchase');
      expect(hash).toBe('abc123');
    });

    it('getLastAuditHash returns empty when no rows', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const hash = await store.getLastAuditHash('ws1', 'purchase');
      expect(hash).toBe('');
    });
  });
});
