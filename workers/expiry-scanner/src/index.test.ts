/**
 * ExpiryScannerWorker tests (Phase 18).
 */

import { describe, it, expect, vi } from 'vitest';
import { ExpiryScannerWorker } from './index.js';
import type { ExpiryScannerWorkerOptions } from './index.js';

type MockExpiryService = ExpiryScannerWorkerOptions['service'];

describe('ExpiryScannerWorker', () => {
  it('runOnce invokes scan when resources exist', async () => {
    const scanWorkspace = vi.fn().mockResolvedValue({ scanned: 2, flagged: 1, revoked: 0 });
    const mockService = { scanWorkspace } as unknown as MockExpiryService;

    const worker = new ExpiryScannerWorker({
      service: mockService,
      resourceProvider: {
        getResources: async () => [
          { workspaceId: 'ws1', type: 'deck', id: 'd1' },
          { workspaceId: 'ws1', type: 'deck', id: 'd2' },
        ],
      },
    });

    const result = await worker.runOnce();

    expect(scanWorkspace).toHaveBeenCalledOnce();
    expect(scanWorkspace).toHaveBeenCalledWith('ws1', [
      { type: 'deck', id: 'd1', lastReviewedAt: null },
      { type: 'deck', id: 'd2', lastReviewedAt: null },
    ]);
    expect(result).toEqual({ scanned: 2, flagged: 1, revoked: 0 });
  });

  it('runOnce returns 0 counts when no resources', async () => {
    const scanWorkspace = vi.fn();
    const mockService = { scanWorkspace } as unknown as MockExpiryService;

    const worker = new ExpiryScannerWorker({
      service: mockService,
    });

    const result = await worker.runOnce();

    expect(scanWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, flagged: 0, revoked: 0 });
  });

  it('tick respects interval', async () => {
    vi.useFakeTimers();

    const scanWorkspace = vi.fn().mockResolvedValue({ scanned: 0, flagged: 0, revoked: 0 });
    const mockService = { scanWorkspace } as unknown as MockExpiryService;

    const worker = new ExpiryScannerWorker({
      service: mockService,
      tickMs: 1000,
      resourceProvider: {
        getResources: async () => [{ workspaceId: 'ws1', type: 'deck', id: 'd1' }],
      },
    });

    worker.start();
    expect(worker.isRunning).toBe(true);

    // Advance 500ms — not yet
    await vi.advanceTimersByTimeAsync(500);
    expect(scanWorkspace).not.toHaveBeenCalled();

    // Advance to 1000ms — should fire
    await vi.advanceTimersByTimeAsync(500);
    expect(scanWorkspace).toHaveBeenCalled();

    worker.stop();
    vi.useRealTimers();
  });

  it('stop prevents further ticks', async () => {
    vi.useFakeTimers();

    const scanWorkspace = vi.fn().mockResolvedValue({ scanned: 0, flagged: 0, revoked: 0 });
    const mockService = { scanWorkspace } as unknown as MockExpiryService;

    const worker = new ExpiryScannerWorker({
      service: mockService,
      tickMs: 1000,
    });

    worker.start();
    worker.stop();

    vi.advanceTimersByTime(2000);
    expect(scanWorkspace).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
