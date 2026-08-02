import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import {
  recordSale,
  recordRefund,
  ledgerBalance,
  isPayoutEligible,
  markPayout,
} from './revenue.js';

function deps(nowFn?: () => number) {
  const store = new InMemoryStore();
  return { deps: defaultDeps(store, { ...(nowFn ? { now: nowFn } : {}) }), store };
}

describe('revenue', () => {
  describe('recordSale', () => {
    it('computes fee and net correctly (feeBps=300)', async () => {
      const { deps: d, store } = deps();
      const event = await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 10000,
        feeBps: 300,
      });
      // fee = round(10000 * 300 / 10000) = 300
      expect(event.feeCents).toBe(300);
      expect(event.netCents).toBe(9700);
      expect(event.grossCents).toBe(10000);
      expect(event.eventType).toBe('sale');
      expect(event.payoutStatus).toBe('pending');
      expect(event.periodMonth).toMatch(/^\d{4}-\d{2}$/);
      // Verify it was persisted
      const events = await store.listRevenueEvents('s1');
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe(event.id);
    });

    it('rounds fee correctly for odd amounts', async () => {
      const { deps: d } = deps();
      // feeBps=200 → fee = round(150 * 200 / 10000) = round(3) = 3
      const event = await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 150,
        feeBps: 200,
      });
      expect(event.feeCents).toBe(3);
      expect(event.netCents).toBe(147);
    });

    it('uses provided periodMonth based on now()', async () => {
      const fixedDate = new Date('2025-03-15T12:00:00Z');
      const { deps: d } = deps(() => fixedDate.getTime());
      const event = await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 5000,
        feeBps: 300,
      });
      expect(event.periodMonth).toBe('2025-03');
    });
  });

  describe('recordRefund', () => {
    it('records negative gross, zero fee', async () => {
      const { deps: d } = deps();
      const event = await recordRefund(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        amountCents: 2000,
        periodMonth: '2025-03',
      });
      expect(event.grossCents).toBe(-2000);
      expect(event.feeCents).toBe(0);
      expect(event.netCents).toBe(-2000);
      expect(event.eventType).toBe('refund');
    });
  });

  describe('ledgerBalance', () => {
    it('sums netCents across sales and refunds', async () => {
      const { deps: d } = deps();
      await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 10000,
        feeBps: 300,
      });
      await recordSale(d, {
        listingId: 'l2',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 5000,
        feeBps: 300,
      });
      await recordRefund(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        amountCents: 1000,
        periodMonth: '2025-03',
      });
      // sales: 9700 + 4850 = 14550, refund: -1000, total = 13550
      const balance = await ledgerBalance(d, 's1');
      expect(balance).toBe(13550);
    });

    it('filters by periodMonth when provided', async () => {
      // Use a fixed now to control periodMonth
      let now = new Date('2025-02-01T00:00:00Z').getTime();
      const d2 = defaultDeps(new InMemoryStore(), { now: () => now });
      await recordSale(d2, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 10000,
        feeBps: 300,
      });
      now = new Date('2025-03-01T00:00:00Z').getTime();
      await recordSale(d2, {
        listingId: 'l2',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 5000,
        feeBps: 300,
      });
      const feb = await ledgerBalance(d2, 's1', '2025-02');
      expect(feb).toBe(9700);
      const mar = await ledgerBalance(d2, 's1', '2025-03');
      expect(mar).toBe(4850);
    });
  });

  describe('isPayoutEligible', () => {
    it('returns true when balance >= minPayoutCents', async () => {
      const fixedDate = new Date('2025-03-15T12:00:00Z');
      const { deps: d } = deps(() => fixedDate.getTime());
      await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 100000,
        feeBps: 300,
      });
      // netCents = 97000, minPayoutCents = 1000
      expect(await isPayoutEligible(d, 's1', '2025-03')).toBe(true);
    });

    it('returns false when balance < minPayoutCents', async () => {
      const fixedDate = new Date('2025-03-15T12:00:00Z');
      const { deps: d } = deps(() => fixedDate.getTime());
      await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 100,
        feeBps: 300,
      });
      // netCents = 97, minPayoutCents = 1000
      expect(await isPayoutEligible(d, 's1', '2025-03')).toBe(false);
    });
  });

  describe('markPayout', () => {
    it('appends an immutable payout row', async () => {
      const { deps: d, store } = deps();
      const payout = await markPayout(d, 's1', '2025-03');
      expect(payout.eventType).toBe('payout');
      expect(payout.payoutStatus).toBe('eligible');
      expect(payout.periodMonth).toBe('2025-03');
      expect(payout.sellerId).toBe('s1');
      // Verify the original rows are not mutated
      const events = await store.listRevenueEvents('s1');
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('payout');
    });

    it('does not mutate existing rows (immutability)', async () => {
      const { deps: d, store } = deps();
      const sale = await recordSale(d, {
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'usd',
        grossCents: 10000,
        feeBps: 300,
      });
      const originalStatus = sale.payoutStatus;
      await markPayout(d, 's1', '2025-03');
      // Re-fetch and confirm original is still 'pending'
      const events = await store.listRevenueEvents('s1');
      const saleEvent = events.find((e) => e.eventType === 'sale');
      expect(saleEvent!.payoutStatus).toBe(originalStatus);
    });
  });
});
