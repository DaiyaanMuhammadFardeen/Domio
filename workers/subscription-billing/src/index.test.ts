/**
 * SubscriptionBillingWorker tests (Phase 19 WS-MKT-4).
 */

import { describe, it, expect, vi } from 'vitest';
import { SubscriptionBillingWorker, InMemorySubscriptionProvider } from './index.js';
import type { SubscriptionRecord } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<SubscriptionRecord> & { id: string }): SubscriptionRecord {
  return {
    workspaceId: 'ws1',
    listingId: 'list1',
    buyerId: 'buyer1',
    providerSubscriptionId: 'sub_abc',
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    canceledAt: null,
    graceEndsAt: null,
    revokedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionBillingWorker', () => {
  it('constructor throws when provider is missing', () => {
    expect(() => new SubscriptionBillingWorker({ provider: undefined as never })).toThrow(
      'provider is required',
    );
  });

  it('runOnce returns 0 counts when no subscriptions', async () => {
    const provider = new InMemorySubscriptionProvider();
    const worker = new SubscriptionBillingWorker({ provider });
    const result = await worker.runOnce();
    expect(result).toEqual({ scanned: 0, canceled: 0, revoked: 0 });
  });

  it('cancelSubscription called for subs past cancel_at_period_end', async () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const sub = makeSub({
      id: 'sub-1',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2025-06-01'),
    });
    const provider = new InMemorySubscriptionProvider([sub]);
    const worker = new SubscriptionBillingWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.canceled).toBe(1);
    expect(result.revoked).toBe(0);
    expect(provider.canceledIds).toEqual(['sub-1']);
  });

  it('does not cancel subs where currentPeriodEnd is in the future', async () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const sub = makeSub({
      id: 'sub-2',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2025-12-01'),
    });
    const provider = new InMemorySubscriptionProvider([sub]);
    const worker = new SubscriptionBillingWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.canceled).toBe(0);
    expect(provider.canceledIds).toEqual([]);
  });

  it('does not cancel subs where cancelAtPeriodEnd is false', async () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const sub = makeSub({
      id: 'sub-3',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2025-01-01'),
    });
    const provider = new InMemorySubscriptionProvider([sub]);
    const worker = new SubscriptionBillingWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.canceled).toBe(0);
  });

  it('revokeSubscription called for subs past grace_ends_at', async () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const sub = makeSub({
      id: 'sub-4',
      status: 'canceled',
      canceledAt: new Date('2025-06-01'),
      graceEndsAt: new Date('2025-06-08'),
      revokedAt: null,
    });
    const provider = new InMemorySubscriptionProvider([sub]);
    const worker = new SubscriptionBillingWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.revoked).toBe(1);
    expect(result.canceled).toBe(0);
    expect(provider.revokedIds).toEqual(['sub-4']);
  });

  it('does not revoke subs where grace_ends_at is in the future', async () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const sub = makeSub({
      id: 'sub-5',
      status: 'canceled',
      canceledAt: new Date('2025-06-14'),
      graceEndsAt: new Date('2025-06-22'),
      revokedAt: null,
    });
    const provider = new InMemorySubscriptionProvider([sub]);
    const worker = new SubscriptionBillingWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.revoked).toBe(0);
    expect(provider.revokedIds).toEqual([]);
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const provider = new InMemorySubscriptionProvider();
    const worker = new SubscriptionBillingWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    expect(worker.isRunning).toBe(true);

    // 500ms — not yet
    await vi.advanceTimersByTimeAsync(500);
    expect(runOnceSpy).not.toHaveBeenCalled();

    // 1000ms — fires
    await vi.advanceTimersByTimeAsync(500);
    expect(runOnceSpy).toHaveBeenCalledOnce();

    worker.stop();
    vi.useRealTimers();
  });

  it('stop prevents further ticks', async () => {
    vi.useFakeTimers();

    const provider = new InMemorySubscriptionProvider();
    const worker = new SubscriptionBillingWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(runOnceSpy).not.toHaveBeenCalled();
    expect(worker.isRunning).toBe(false);

    vi.useRealTimers();
  });
});
