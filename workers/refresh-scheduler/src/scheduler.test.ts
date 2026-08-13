/**
 * Refresh scheduler tests — covers on_interval scheduling with fake
 * timers, drift tolerance, eager trigger, and error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RefreshScheduler } from './scheduler.js';
import type { QueryRecord, SchedulerCallbacks } from './scheduler.js';

function makeQuery(overrides: Partial<QueryRecord> = {}): QueryRecord {
  return {
    queryId: 'q1',
    orgId: 'org-1',
    sql: 'SELECT * FROM test',
    connectorId: 'conn-1',
    params: [],
    freshnessPolicy: { type: 'on_interval', intervalMs: 1000 },
    createdBy: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<SchedulerCallbacks> = {}): SchedulerCallbacks & {
  refreshCalls: string[];
} {
  const state = {
    refreshCalls: [] as string[],
  };

  return {
    ...state,
    refresh: async (queryId: string, _orgId: string) => {
      state.refreshCalls.push(queryId);
    },
    listQueries: async (_type: string) => {
      return [];
    },
    ...overrides,
  };
}

describe('RefreshScheduler — on_interval scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires at correct ticks', async () => {
    const callbacks = makeCallbacks();
    // Use a large tick interval so we control exactly when ticks fire
    const scheduler = new RefreshScheduler(callbacks, { tickIntervalMs: 1000 });

    const q = makeQuery({ freshnessPolicy: { type: 'on_interval', intervalMs: 500 } });
    scheduler.addQuery(q);
    await scheduler.start();

    // First tick at 1000ms: query is due (nextTickMs = 0 + 500)
    // Drift = 1000 - 500 = 500 ≤ maxDriftMs (1000) → fires
    // nextTickMs becomes 500 + 500 = 1000
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.refreshCalls).toHaveLength(1);
    expect(callbacks.refreshCalls[0]).toBe('q1');

    // Second tick at 2000ms: nextTickMs = 1000, fires again
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.refreshCalls).toHaveLength(2);

    scheduler.stop();
  });

  it('maintains cadence even if tick is late', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks, { tickIntervalMs: 500, maxDriftMs: 2000 });

    const q = makeQuery({ freshnessPolicy: { type: 'on_interval', intervalMs: 100 } });
    scheduler.addQuery(q);
    await scheduler.start();

    // Tick at 500ms: query was due at 100ms
    // Drift = 500 - 100 = 400 ≤ maxDriftMs (2000) → fires, cadence maintained
    // nextTickMs = 100 + 100 = 200
    await vi.advanceTimersByTimeAsync(500);
    expect(callbacks.refreshCalls).toHaveLength(1);

    // Tick at 1000ms: nextTickMs = 200
    // Drift = 1000 - 200 = 800 ≤ 2000 → fires
    // nextTickMs = 200 + 100 = 300
    await vi.advanceTimersByTimeAsync(500);
    expect(callbacks.refreshCalls).toHaveLength(2);

    // Tick at 1500ms: nextTickMs = 300
    // Drift = 1500 - 300 = 1200 ≤ 2000 → fires
    // nextTickMs = 300 + 100 = 400
    await vi.advanceTimersByTimeAsync(500);
    expect(callbacks.refreshCalls).toHaveLength(3);

    scheduler.stop();
  });

  it('reschedules when drift exceeds maxDriftMs', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks, { tickIntervalMs: 500, maxDriftMs: 50 });

    // Start at known time
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const q = makeQuery({ freshnessPolicy: { type: 'on_interval', intervalMs: 100 } });
    scheduler.addQuery(q);
    // nextTickMs = Date.now() + 100 = 12:00:00.100

    await scheduler.start();

    // Tick at +500ms: query was due at +100ms
    // Drift = 500 - 100 = 400 > maxDriftMs (50) → reschedule from now
    // nextTickMs = 500 + 100 = 600 (no fire!)
    await vi.advanceTimersByTimeAsync(500);
    expect(callbacks.refreshCalls).toHaveLength(0);

    // Tick at +1000ms: nextTickMs = 600
    // Drift = 1000 - 600 = 400 > 50 → reschedule from now
    // nextTickMs = 1000 + 100 = 1100 (no fire!)
    await vi.advanceTimersByTimeAsync(500);
    expect(callbacks.refreshCalls).toHaveLength(0);

    scheduler.stop();
  });

  it('fires when drift is within tolerance', async () => {
    const callbacks = makeCallbacks();
    // tickInterval > query interval means the tick arrives late
    const scheduler = new RefreshScheduler(callbacks, { tickIntervalMs: 200, maxDriftMs: 300 });

    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const q = makeQuery({
      queryId: 'q2',
      freshnessPolicy: { type: 'on_interval', intervalMs: 100 },
    });
    scheduler.addQuery(q);
    // nextTickMs = Date.now() + 100 = 12:00:00.100

    await scheduler.start();

    // Tick at +200ms: query was due at +100ms
    // Drift = 200 - 100 = 100 ≤ maxDriftMs (300) → fires!
    await vi.advanceTimersByTimeAsync(200);
    expect(callbacks.refreshCalls).toHaveLength(1);

    scheduler.stop();
  });
});

describe('RefreshScheduler — eager trigger', () => {
  it('triggers eager query on trigger() call', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks);

    const q = makeQuery({ freshnessPolicy: { type: 'eager' } });
    scheduler.addQuery(q);
    await scheduler.start();

    expect(callbacks.refreshCalls).toHaveLength(0);
    await scheduler.trigger('q1');
    expect(callbacks.refreshCalls).toHaveLength(1);
    expect(callbacks.refreshCalls[0]).toBe('q1');

    scheduler.stop();
  });

  it('ignores trigger for unknown query', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks);
    await scheduler.start();

    await scheduler.trigger('unknown');
    expect(callbacks.refreshCalls).toHaveLength(0);

    scheduler.stop();
  });
});

describe('RefreshScheduler — lifecycle', () => {
  it('tracks scheduled and eager counts', () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks);

    const q1 = makeQuery({
      queryId: 'q1',
      freshnessPolicy: { type: 'on_interval', intervalMs: 1000 },
    });
    const q2 = makeQuery({ queryId: 'q2', freshnessPolicy: { type: 'eager' } });
    scheduler.addQuery(q1);
    scheduler.addQuery(q2);

    expect(scheduler.scheduledCount).toBe(1);
    expect(scheduler.eagerCount).toBe(1);

    scheduler.removeQuery('q1');
    expect(scheduler.scheduledCount).toBe(0);
    expect(scheduler.eagerCount).toBe(1);
  });

  it('isRunning reflects start/stop', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks);

    expect(scheduler.isRunning).toBe(false);
    await scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });

  it('start is idempotent', async () => {
    const callbacks = makeCallbacks();
    const scheduler = new RefreshScheduler(callbacks);

    await scheduler.start();
    await scheduler.start(); // Should not throw or double-start
    expect(scheduler.isRunning).toBe(true);

    scheduler.stop();
  });
});
