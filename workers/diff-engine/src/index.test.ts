/**
 * DiffEngineWorker tests (Phase 18 W2).
 *
 * Tests worker runOnce, start/stop, and conflict detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffEngineWorker, InMemoryReplayProvider } from './index.js';
import type { MergeRequestService } from '@domio/merge-request-service';
import type { MergeRequestEventEmitter } from '@domio/merge-request-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockService(overrides?: Partial<MergeRequestService>): MergeRequestService {
  return {
    createMergeRequest: vi.fn(),
    getMergeRequest: vi
      .fn()
      .mockResolvedValue({ id: 'mr-1', status: 'open', deck_id: 'deck-1', workspace_id: 'ws-1' }),
    listMergeRequests: vi.fn().mockResolvedValue([]),
    getMergeRequestDiffs: vi.fn().mockResolvedValue({
      id: 'sd-1',
      mr_id: 'mr-1',
      slide_diffs: [],
      binding_diffs: [],
      computed_at: new Date(),
    }),
    resolveMergeRequestConflict: vi.fn(),
    mergeMergeRequest: vi.fn().mockResolvedValue({ id: 'mr-1', status: 'merged' }),
    closeMergeRequest: vi.fn(),
    ...overrides,
  } as MergeRequestService;
}

function createMockMrProvider() {
  return {
    getOpenMergeRequests: vi
      .fn()
      .mockResolvedValue([
        {
          id: 'mr-1',
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          source_branch: 'feature',
          target_branch: 'main',
        },
      ]),
  };
}

function createMockEmitter(): MergeRequestEventEmitter & {
  events: Array<{ subject: string; payload: Record<string, unknown> }>;
} {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>) {
      events.push({ subject, payload });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiffEngineWorker', () => {
  let service: ReturnType<typeof createMockService>;
  let mrProvider: ReturnType<typeof createMockMrProvider>;
  let emitter: ReturnType<typeof createMockEmitter>;

  beforeEach(() => {
    service = createMockService();
    mrProvider = createMockMrProvider();
    emitter = createMockEmitter();
  });

  describe('constructor', () => {
    it('throws if service is missing', () => {
      expect(() => new DiffEngineWorker({ service: null as never })).toThrow('service is required');
    });
  });

  describe('start/stop', () => {
    it('starts and stops the timer', () => {
      const worker = new DiffEngineWorker({
        service: service as never,
        mrProvider,
        tickMs: 1000,
      });

      expect(worker.isRunning).toBe(false);
      worker.start();
      expect(worker.isRunning).toBe(true);
      worker.stop();
      expect(worker.isRunning).toBe(false);
    });

    it('does not start twice', () => {
      const worker = new DiffEngineWorker({
        service: service as never,
        mrProvider,
        tickMs: 1000,
      });

      worker.start();
      worker.start(); // should be idempotent
      expect(worker.isRunning).toBe(true);
      worker.stop();
    });
  });

  describe('runOnce', () => {
    it('processes open merge requests', async () => {
      const worker = new DiffEngineWorker({
        service: service as never,
        mrProvider,
        eventEmitter: emitter,
        tickMs: 1000,
      });

      const result = await worker.runOnce();
      expect(result.processed).toBe(1);
      expect(result.conflicts_found).toBe(0);
    });

    it('detects conflicts and emits event', async () => {
      // Mock service to return diff with conflicts
      const mockService = createMockService({
        getMergeRequestDiffs: vi.fn().mockResolvedValue({
          id: 'sd-1',
          mr_id: 'mr-1',
          slide_diffs: [
            {
              slide_id: 's1',
              change_type: 'modified',
              before: null,
              after: null,
              element_diffs: [
                {
                  element_id: 'e1',
                  path: 'elements[e1].style.x',
                  change_type: 'modified',
                  source_value: 10,
                  target_value: 20,
                  base_value: 0,
                  is_conflict: true,
                },
              ],
            },
          ],
          binding_diffs: [],
          computed_at: new Date(),
        }),
        getMergeRequest: vi
          .fn()
          .mockResolvedValue({
            id: 'mr-1',
            status: 'open',
            deck_id: 'deck-1',
            workspace_id: 'ws-1',
          }),
      });

      const worker = new DiffEngineWorker({
        service: mockService as never,
        mrProvider,
        eventEmitter: emitter,
        tickMs: 1000,
      });

      const result = await worker.runOnce();
      expect(result.conflicts_found).toBe(1);
      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0]!.subject).toBe('merge_request.conflict_detected');
    });

    it('auto-merges when no conflicts', async () => {
      const mockService = createMockService({
        getMergeRequestDiffs: vi.fn().mockResolvedValue({
          id: 'sd-1',
          mr_id: 'mr-1',
          slide_diffs: [],
          binding_diffs: [],
          computed_at: new Date(),
        }),
        mergeMergeRequest: vi.fn().mockResolvedValue({ id: 'mr-1', status: 'merged' }),
      });

      const worker = new DiffEngineWorker({
        service: mockService as never,
        mrProvider,
        eventEmitter: emitter,
        tickMs: 1000,
      });

      const result = await worker.runOnce();
      expect(result.merged).toBe(1);
    });

    it('handles empty open MR list', async () => {
      const emptyProvider = { getOpenMergeRequests: async () => [] };
      const worker = new DiffEngineWorker({
        service: service as never,
        mrProvider: emptyProvider,
        eventEmitter: emitter,
        tickMs: 1000,
      });

      const result = await worker.runOnce();
      expect(result.processed).toBe(0);
      expect(result.conflicts_found).toBe(0);
      expect(result.merged).toBe(0);
    });
  });
});

describe('InMemoryReplayProvider', () => {
  it('returns empty deck snapshot', async () => {
    const snapshot = await InMemoryReplayProvider.replayToSnapshot('ws-1', 'deck-1', 'main');
    expect(snapshot.slides).toHaveLength(0);
  });
});
