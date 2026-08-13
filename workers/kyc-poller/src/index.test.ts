/**
 * KycPollerWorker tests (Phase 19 WS-MKT-6).
 */

import { describe, it, expect, vi } from 'vitest';
import { KycPollerWorker, InMemoryKycSessionProvider, SandboxKycClient } from './index.js';
import type { KycSessionRecord, KycClient } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<KycSessionRecord> & { kyc_session_id: string },
): KycSessionRecord {
  return {
    creator_id: 'creator-1',
    vendor: 'persona',
    vendor_session_id: 'sess-1',
    status: 'submitted',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KycPollerWorker', () => {
  it('constructor throws when provider is missing', () => {
    expect(
      () =>
        new KycPollerWorker({ provider: undefined as never, kycClient: new SandboxKycClient() }),
    ).toThrow('provider is required');
  });

  it('constructor throws when kycClient is missing', () => {
    expect(
      () =>
        new KycPollerWorker({
          provider: new InMemoryKycSessionProvider(),
          kycClient: undefined as never,
        }),
    ).toThrow('kycClient is required');
  });

  it('runOnce returns zero counts when no pending sessions', async () => {
    const provider = new InMemoryKycSessionProvider();
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });
    const result = await worker.runOnce();
    expect(result).toEqual({ polled: 0, approved: 0, rejected: 0, still_pending: 0, errored: 0 });
  });

  it('approves session when vendor returns approved', async () => {
    const session = makeSession({
      kyc_session_id: 'kyc-1',
      vendor_session_id: 'sess-ok', // ends with '-ok'
    });
    const provider = new InMemoryKycSessionProvider([session]);
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });

    const result = await worker.runOnce();

    expect(result.polled).toBe(1);
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.still_pending).toBe(0);
    expect(provider.updated).toEqual([{ id: 'kyc-1', status: 'approved' }]);
  });

  it('rejects session when vendor returns rejected', async () => {
    const session = makeSession({
      kyc_session_id: 'kyc-2',
      vendor_session_id: 'sess-no', // ends with '-no'
    });
    const provider = new InMemoryKycSessionProvider([session]);
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });

    const result = await worker.runOnce();

    expect(result.polled).toBe(1);
    expect(result.approved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.still_pending).toBe(0);
    expect(provider.updated).toEqual([{ id: 'kyc-2', status: 'rejected' }]);
  });

  it('keeps session pending when vendor returns pending', async () => {
    const session = makeSession({
      kyc_session_id: 'kyc-3',
      vendor_session_id: 'sess-wait', // no suffix
    });
    const provider = new InMemoryKycSessionProvider([session]);
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });

    const result = await worker.runOnce();

    expect(result.polled).toBe(1);
    expect(result.approved).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.still_pending).toBe(1);
    expect(provider.updated).toEqual([]);
  });

  it('counts errored sessions without crashing', async () => {
    const session = makeSession({
      kyc_session_id: 'kyc-err',
      vendor_session_id: 'sess-err',
    });
    const provider = new InMemoryKycSessionProvider([session]);
    const failingClient: KycClient = {
      async pollStatus() {
        throw new Error('vendor down');
      },
    };
    const worker = new KycPollerWorker({ provider, kycClient: failingClient });

    const result = await worker.runOnce();

    expect(result.polled).toBe(1);
    expect(result.errored).toBe(1);
    expect(result.approved).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.still_pending).toBe(0);
  });

  it('processes multiple sessions in batch', async () => {
    const s1 = makeSession({ kyc_session_id: 'kyc-a', vendor_session_id: 'sess-a-ok' });
    const s2 = makeSession({ kyc_session_id: 'kyc-b', vendor_session_id: 'sess-b-no' });
    const s3 = makeSession({ kyc_session_id: 'kyc-c', vendor_session_id: 'sess-c' });
    const provider = new InMemoryKycSessionProvider([s1, s2, s3]);
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });

    const result = await worker.runOnce();

    expect(result.polled).toBe(3);
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.still_pending).toBe(1);
    expect(provider.updated).toEqual([
      { id: 'kyc-a', status: 'approved' },
      { id: 'kyc-b', status: 'rejected' },
    ]);
  });

  it('idempotent — already-processed sessions are not in listPendingSessions', async () => {
    // Only submit an 'approved' session; listPendingSessions should exclude it
    const session = makeSession({
      kyc_session_id: 'kyc-done',
      vendor_session_id: 'sess-done-ok',
      status: 'approved',
    });
    const provider = new InMemoryKycSessionProvider([session]);
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client });

    const result = await worker.runOnce();

    expect(result.polled).toBe(0);
    expect(result.approved).toBe(0);
    expect(provider.updated).toEqual([]);
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const provider = new InMemoryKycSessionProvider();
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client, tickMs: 1000 });
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

    const provider = new InMemoryKycSessionProvider();
    const client = new SandboxKycClient();
    const worker = new KycPollerWorker({ provider, kycClient: client, tickMs: 1000 });
    const runOnceSpy = vi.spyOn(worker, 'runOnce');

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(runOnceSpy).not.toHaveBeenCalled();
    expect(worker.isRunning).toBe(false);

    vi.useRealTimers();
  });
});
