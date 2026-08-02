import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import { recordSale } from '../marketplace/revenue.js';
import { run } from './payout-ledger-writer.js';

describe('payout-ledger-writer worker', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
  });

  it('marks payout when eligible', async () => {
    const fixedDate = new Date('2025-03-15T12:00:00Z');
    const d = defaultDeps(store, { now: () => fixedDate.getTime() });
    // Record a large sale so balance >= minPayoutCents (1000)
    await recordSale(d, {
      listingId: 'l1',
      sellerId: 's1',
      workspaceId: 'w1',
      currency: 'usd',
      grossCents: 100000,
      feeBps: 300,
    });
    // netCents = 97000, well above 1000

    const result = await run(d, 's1', '2025-03');
    expect(result.marked).toBe(true);
    expect(result.payoutEvent).toBeDefined();
    expect(result.payoutEvent!.eventType).toBe('payout');
    expect(result.payoutEvent!.payoutStatus).toBe('eligible');
  });

  it('returns no-op when ineligible', async () => {
    const fixedDate = new Date('2025-03-15T12:00:00Z');
    const d = defaultDeps(store, { now: () => fixedDate.getTime() });
    // Record a small sale so balance < minPayoutCents
    await recordSale(d, {
      listingId: 'l1',
      sellerId: 's1',
      workspaceId: 'w1',
      currency: 'usd',
      grossCents: 500,
      feeBps: 300,
    });
    // netCents = 485, below 1000

    const result = await run(d, 's1', '2025-03');
    expect(result.marked).toBe(false);
    expect(result.payoutEvent).toBeUndefined();
  });

  it('returns no-op when no revenue events exist', async () => {
    const d = defaultDeps(store);
    const result = await run(d, 'nonexistent', '2025-03');
    expect(result.marked).toBe(false);
  });
});
