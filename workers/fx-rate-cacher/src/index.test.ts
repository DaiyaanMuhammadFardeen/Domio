/**
 * FxRateCacherWorker tests (Phase 19 WS-MKT-7).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FxRateCacherWorker,
  InMemoryFxRateProvider,
} from './index.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FxRateCacherWorker', () => {

  it('constructor throws when provider is missing', () => {
    expect(() => new FxRateCacherWorker({ provider: undefined as never }))
      .toThrow('provider is required');
  });

  it('runOnce fetches and upserts all 6 currency pairs', async () => {
    const provider = new InMemoryFxRateProvider();
    const now = new Date('2025-07-15T00:00:00Z');
    const worker = new FxRateCacherWorker({
      provider,
      now: () => now,
    });

    const result = await worker.runOnce();

    expect(result.upserted).toBe(6);
    expect(result.pairs).toHaveLength(6);
    expect(result.pairs).toContain('USD/BDT');
    expect(result.pairs).toContain('USD/EUR');
    expect(result.pairs).toContain('BDT/USD');
    expect(result.pairs).toContain('EUR/USD');
    expect(result.pairs).toContain('BDT/EUR');
    expect(result.pairs).toContain('EUR/BDT');

    const records = provider.getUpsertedRecords();
    expect(records).toHaveLength(6);
  });

  it('USD/BDT rate is approximately 110', async () => {
    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider });

    await worker.runOnce();

    const records = provider.getUpsertedRecords();
    const usdBdt = records.find(r => r.base === 'USD' && r.quote === 'BDT');
    expect(usdBdt).toBeDefined();
    expect(usdBdt!.rate).toBeCloseTo(110, 0);
  });

  it('cross-rate BDT/EUR is derived via USD (BDT/USD * USD/EUR)', async () => {
    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider });

    await worker.runOnce();

    const records = provider.getUpsertedRecords();
    const bdtEur = records.find(r => r.base === 'BDT' && r.quote === 'EUR');
    expect(bdtEur).toBeDefined();
    // BDT/EUR = quoteUsd/baseUsd = EUR_usd/BDT_usd = 0.92/110 ≈ 0.008363...
    expect(bdtEur!.rate).toBeCloseTo(0.92 / 110, 6);
  });

  it('EUR/USD rate is approximately 1/0.92 ≈ 1.087', async () => {
    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider });

    await worker.runOnce();

    const records = provider.getUpsertedRecords();
    const eurUsd = records.find(r => r.base === 'EUR' && r.quote === 'USD');
    expect(eurUsd).toBeDefined();
    expect(eurUsd!.rate).toBeCloseTo(1 / 0.92, 3);
  });

  it('idempotent dedup: second run with same fetched_at is deduped by provider', async () => {
    const provider = new InMemoryFxRateProvider();
    const now = new Date('2025-07-15T00:00:00Z');
    const worker = new FxRateCacherWorker({
      provider,
      now: () => now,
    });

    const result1 = await worker.runOnce();
    expect(result1.upserted).toBe(6);
    expect(provider.getUpsertedRecords()).toHaveLength(6);

    // Second run with same timestamp — provider deduplicates via Set
    const result2 = await worker.runOnce();
    expect(result2.upserted).toBe(6);
    // Provider still has only 6 unique records (deduped)
    expect(provider.getUpsertedRecords()).toHaveLength(6);
  });

  it('counts shape includes upserted and pairs', async () => {
    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider });

    const result = await worker.runOnce();
    expect(result).toHaveProperty('upserted');
    expect(result).toHaveProperty('pairs');
    expect(typeof result.upserted).toBe('number');
    expect(Array.isArray(result.pairs)).toBe(true);
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    expect(worker.isRunning).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(runOnceSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(runOnceSpy).toHaveBeenCalledOnce();

    worker.stop();
    vi.useRealTimers();
  });

  it('stop prevents further ticks', async () => {
    vi.useFakeTimers();

    const provider = new InMemoryFxRateProvider();
    const worker = new FxRateCacherWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(runOnceSpy).not.toHaveBeenCalled();
    expect(worker.isRunning).toBe(false);

    vi.useRealTimers();
  });
});
