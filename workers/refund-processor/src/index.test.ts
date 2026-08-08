/**
 * RefundProcessorWorker tests (Phase 19 WS-MKT-4).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  RefundProcessorWorker,
  InMemoryRefundProvider,
} from './index.js';
import type { PaymentIntentRecord } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePI(overrides: Partial<PaymentIntentRecord> & { id: string }): PaymentIntentRecord {
  return {
    workspaceId: 'ws1',
    buyerId: 'buyer1',
    listingId: 'list1',
    purchaseId: 'purchase-1',
    provider: 'stripe',
    providerIntentId: 'pi_stripe_123',
    currency: 'USD',
    grossCents: 1000n,
    taxCents: 100n,
    feeCents: 50n,
    netCents: 850n,
    status: 'succeeded',
    refundStatus: 'none',
    idempotencyKey: 'idem-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RefundProcessorWorker', () => {

  it('constructor throws when provider is missing', () => {
    expect(() => new RefundProcessorWorker({ provider: undefined as never }))
      .toThrow('provider is required');
  });

  it('runOnce returns 0 counts when no pending refunds', async () => {
    const provider = new InMemoryRefundProvider();
    const worker = new RefundProcessorWorker({ provider });
    const result = await worker.runOnce();
    expect(result).toEqual({ processed: 0, approved: 0 });
  });

  it('approveRefund called for payment intents with refund_status requested', async () => {
    const pi = makePI({ id: 'pi-1', refundStatus: 'requested' });
    const provider = new InMemoryRefundProvider([pi]);
    const worker = new RefundProcessorWorker({ provider });

    const result = await worker.runOnce();

    expect(result.processed).toBe(1);
    expect(result.approved).toBe(1);
    expect(provider.approvedIds).toEqual(['pi-1']);
  });

  it('does not approve payment intents with refund_status none', async () => {
    const pi = makePI({ id: 'pi-2', refundStatus: 'none' });
    const provider = new InMemoryRefundProvider([pi]);
    const worker = new RefundProcessorWorker({ provider });

    const result = await worker.runOnce();

    expect(result.processed).toBe(0);
    expect(result.approved).toBe(0);
    expect(provider.approvedIds).toEqual([]);
  });

  it('does not approve payment intents with refund_status already refunded', async () => {
    const pi = makePI({ id: 'pi-3', refundStatus: 'refunded' });
    const provider = new InMemoryRefundProvider([pi]);
    const worker = new RefundProcessorWorker({ provider });

    const result = await worker.runOnce();

    expect(result.processed).toBe(0);
    expect(provider.approvedIds).toEqual([]);
  });

  it('processes multiple pending refunds in batch', async () => {
    const pi1 = makePI({ id: 'pi-a', refundStatus: 'requested' });
    const pi2 = makePI({ id: 'pi-b', refundStatus: 'requested' });
    const pi3 = makePI({ id: 'pi-c', refundStatus: 'none' });
    const provider = new InMemoryRefundProvider([pi1, pi2, pi3]);
    const worker = new RefundProcessorWorker({ provider });

    const result = await worker.runOnce();

    expect(result.processed).toBe(2);
    expect(result.approved).toBe(2);
    expect(provider.approvedIds).toEqual(['pi-a', 'pi-b']);
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const provider = new InMemoryRefundProvider();
    const worker = new RefundProcessorWorker({ provider, tickMs: 1000 });
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

    const provider = new InMemoryRefundProvider();
    const worker = new RefundProcessorWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(runOnceSpy).not.toHaveBeenCalled();
    expect(worker.isRunning).toBe(false);

    vi.useRealTimers();
  });
});
