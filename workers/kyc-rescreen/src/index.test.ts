/**
 * KycRescreenWorker tests (Phase 19 WS-MKT-6).
 */

import { describe, it, expect, vi } from 'vitest';
import { KycRescreenWorker, InMemoryRescreenProvider } from './index.js';
import type { CreatorRecord } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCreator(overrides: Partial<CreatorRecord> & { creator_id: string }): CreatorRecord {
  return {
    display_name: 'Alice Creator',
    country_code: 'US',
    kyc_status: 'approved',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KycRescreenWorker', () => {
  it('constructor throws when provider is missing', () => {
    expect(() => new KycRescreenWorker({ provider: undefined as never })).toThrow(
      'provider is required',
    );
  });

  it('runOnce returns zero counts when no approved creators', async () => {
    const provider = new InMemoryRescreenProvider();
    const worker = new KycRescreenWorker({ provider });
    const result = await worker.runOnce();
    expect(result).toEqual({ scanned: 0, flagged: 0, frozen: 0, reviewed: 0 });
  });

  it('sanctions hit → freeze and record hit', async () => {
    const creator = makeCreator({
      creator_id: 'cr-sanc',
      display_name: 'John Sanctions', // contains 'sanc'
    });
    const provider = new InMemoryRescreenProvider([creator]);
    const worker = new KycRescreenWorker({ provider });

    const result = await worker.runOnce();

    expect(result.scanned).toBe(1);
    expect(result.flagged).toBe(1);
    expect(result.frozen).toBe(1);
    expect(result.reviewed).toBe(0);
    expect(provider.frozenIds).toEqual(['cr-sanc']);
    expect(provider.hits).toHaveLength(1);
    expect(provider.hits[0]?.kind).toBe('sanctions');
    expect(provider.hits[0]?.decision).toBe('freeze');
  });

  it('PEP hit → review and flag', async () => {
    const creator = makeCreator({
      creator_id: 'cr-pep',
      display_name: 'Pep Official', // contains 'pep'
    });
    const provider = new InMemoryRescreenProvider([creator]);
    const worker = new KycRescreenWorker({ provider });

    const result = await worker.runOnce();

    expect(result.scanned).toBe(1);
    expect(result.flagged).toBe(1);
    expect(result.frozen).toBe(0);
    expect(result.reviewed).toBe(1);
    expect(provider.reviewedIds).toEqual(['cr-pep']);
    expect(provider.hits).toHaveLength(1);
    expect(provider.hits[0]?.kind).toBe('pep');
    expect(provider.hits[0]?.decision).toBe('review');
  });

  it('clean creator → no flag', async () => {
    const creator = makeCreator({
      creator_id: 'cr-clean',
      display_name: 'Clean Creator',
    });
    const provider = new InMemoryRescreenProvider([creator]);
    const worker = new KycRescreenWorker({ provider });

    const result = await worker.runOnce();

    expect(result.scanned).toBe(1);
    expect(result.flagged).toBe(0);
    expect(result.frozen).toBe(0);
    expect(result.reviewed).toBe(0);
    expect(provider.hits).toHaveLength(0);
    expect(provider.frozenIds).toEqual([]);
    expect(provider.reviewedIds).toEqual([]);
  });

  it('idempotent — frozen creators not in listApprovedCreators', async () => {
    // Pre-freeze a creator so listApprovedCreators excludes it
    const creator = makeCreator({
      creator_id: 'cr-frozen',
      display_name: 'Frozen Sanctioned',
      kyc_status: 'frozen',
    });
    const provider = new InMemoryRescreenProvider([creator]);
    const worker = new KycRescreenWorker({ provider });

    const result = await worker.runOnce();

    expect(result.scanned).toBe(0);
    expect(result.flagged).toBe(0);
    expect(provider.hits).toHaveLength(0);
  });

  it('processes multiple creators in batch', async () => {
    const c1 = makeCreator({ creator_id: 'cr-sanc', display_name: 'Sanctions Bad' });
    const c2 = makeCreator({ creator_id: 'cr-pep', display_name: 'Pep Person' });
    const c3 = makeCreator({ creator_id: 'cr-clean', display_name: 'Clean Person' });
    const provider = new InMemoryRescreenProvider([c1, c2, c3]);
    const worker = new KycRescreenWorker({ provider });

    const result = await worker.runOnce();

    expect(result.scanned).toBe(3);
    expect(result.flagged).toBe(2);
    expect(result.frozen).toBe(1);
    expect(result.reviewed).toBe(1);
    expect(provider.frozenIds).toEqual(['cr-sanc']);
    expect(provider.reviewedIds).toEqual(['cr-pep']);
    expect(provider.hits).toHaveLength(2);
  });

  it('per-creator error resilience — one failure does not stop others', async () => {
    const c1 = makeCreator({ creator_id: 'cr-err', display_name: 'Error Creator' });
    const c2 = makeCreator({ creator_id: 'cr-ok', display_name: 'Clean Creator' });
    const provider = new InMemoryRescreenProvider([c1, c2]);

    const originalCheckIdentity = provider.checkIdentity.bind(provider);
    provider.checkIdentity = async (creator: CreatorRecord) => {
      if (creator.creator_id === 'cr-err') {
        throw new Error('network timeout');
      }
      return originalCheckIdentity(creator);
    };

    const worker = new KycRescreenWorker({ provider });
    const result = await worker.runOnce();

    expect(result.scanned).toBe(2);
    // cr-err threw, cr-ok was clean
    expect(result.flagged).toBe(0);
    expect(result.frozen).toBe(0);
    expect(result.reviewed).toBe(0);
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const provider = new InMemoryRescreenProvider();
    const worker = new KycRescreenWorker({ provider, tickMs: 1000 });
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

    const provider = new InMemoryRescreenProvider();
    const worker = new KycRescreenWorker({ provider, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(runOnceSpy).not.toHaveBeenCalled();
    expect(worker.isRunning).toBe(false);

    vi.useRealTimers();
  });
});
