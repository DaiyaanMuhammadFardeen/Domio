/**
 * PgAnalyticsStore tests (Phase 19 Wave 3).
 *
 * Fake-pool unit tests (~8 tests) verifying SQL construction
 * and error paths without a real database.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgAnalyticsStore, StoreNotConfiguredError } from './pg_store.js';

function createFakePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
    }),
  };
}

describe('PgAnalyticsStore', () => {
  // -------------------------------------------------------------------------
  // StoreNotConfiguredError (null pool)
  // -------------------------------------------------------------------------

  describe('null pool', () => {
    const store = new PgAnalyticsStore(null);

    it('getRevenueEvents throws StoreNotConfiguredError', async () => {
      await expect(
        store.getRevenueEvents({ creator_id: 'c1', period_month: '2025-06' }),
      ).rejects.toThrow(StoreNotConfiguredError);
    });

    it('getPaymentIntents throws StoreNotConfiguredError', async () => {
      await expect(store.getPaymentIntents({ buyer_id: 'b1' })).rejects.toThrow(
        StoreNotConfiguredError,
      );
    });

    it('getLicenseGrants throws StoreNotConfiguredError', async () => {
      await expect(store.getLicenseGrants('c1')).rejects.toThrow(StoreNotConfiguredError);
    });

    it('listStatements throws StoreNotConfiguredError', async () => {
      await expect(store.listStatements({ creator_id: 'c1' })).rejects.toThrow(
        StoreNotConfiguredError,
      );
    });

    it('getStatement throws StoreNotConfiguredError', async () => {
      await expect(store.getStatement('s1')).rejects.toThrow(StoreNotConfiguredError);
    });

    it('insertStatement throws StoreNotConfiguredError', async () => {
      await expect(
        store.insertStatement({
          statement_id: 's1',
          creator_id: 'c1',
          period_month: '2025-06',
          kind: 'monthly',
          total_gross_cents: 0,
          total_fee_cents: 0,
          total_net_cents: 0,
          currency: 'USD',
          generated_at: Date.now(),
        }),
      ).rejects.toThrow(StoreNotConfiguredError);
    });

    it('withTransaction throws StoreNotConfiguredError', async () => {
      await expect(store.withTransaction(async () => 42)).rejects.toThrow(StoreNotConfiguredError);
    });
  });

  // -------------------------------------------------------------------------
  // With pool — verify SQL queries are built
  // -------------------------------------------------------------------------

  describe('with pool', () => {
    it('getRevenueEvents queries revenue_share_event with correct params', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 'rev-1',
            listing_id: 'list-1',
            seller_id: 'c1',
            workspace_id: 'ws-1',
            currency: 'USD',
            gross_cents: 1000,
            fee_cents: 300,
            net_cents: 700,
            payout_status: 'eligible',
            period_month: '2025-06',
            event_type: 'purchase',
          },
        ],
      });

      const store = new PgAnalyticsStore(pool as never);
      const result = await store.getRevenueEvents({
        creator_id: 'c1',
        period_month: '2025-06',
      });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM revenue_share_event'), [
        'c1',
        '2025-06',
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.seller_id).toBe('c1');
    });

    it('getPaymentIntents with buyer_id queries payment_intent', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.getPaymentIntents({ buyer_id: 'b1' });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM payment_intent'), [
        'b1',
      ]);
    });

    it('getPaymentIntents with creator_id joins via marketplace_listing', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.getPaymentIntents({ creator_id: 'c1' });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN marketplace_listing'), [
        'c1',
      ]);
    });

    it('getLicenseGrants joins via marketplace_listing', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.getLicenseGrants('c1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN marketplace_listing'), [
        'c1',
      ]);
    });

    it('listStatements queries statement_record with optional kind filter', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.listStatements({ creator_id: 'c1', kind: 'monthly' });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('AND kind = $2'), [
        'c1',
        'monthly',
      ]);
    });

    it('getStatement queries by id', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.getStatement('stmt-1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['stmt-1']);
    });

    it('insertStatement inserts into statement_record', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValue({ rows: [] });

      const store = new PgAnalyticsStore(pool as never);
      await store.insertStatement({
        statement_id: 'stmt-1',
        creator_id: 'c1',
        period_month: '2025-06',
        kind: 'monthly',
        total_gross_cents: 1000,
        total_fee_cents: 300,
        total_net_cents: 700,
        currency: 'USD',
        generated_at: Date.now(),
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO statement_record'),
        expect.arrayContaining(['stmt-1', '', 'c1', '2025-06', 'monthly']),
      );
    });

    it('withTransaction uses BEGIN/COMMIT', async () => {
      const pool = createFakePool();
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValue(mockClient);

      const store = new PgAnalyticsStore(pool as never);
      const result = await store.withTransaction(async () => 42);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(42);
    });

    it('withTransaction rolls back on error', async () => {
      const pool = createFakePool();
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValue(mockClient);

      const store = new PgAnalyticsStore(pool as never);
      await expect(
        store.withTransaction(async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow('fail');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
