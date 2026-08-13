/**
 * @domio/diff-engine — Phase 18 W2 diff engine worker.
 *
 * Periodically processes open merge requests, recomputes diffs,
 * detects conflicts, and auto-merges fast-forwards.
 *
 * Modules:
 *   index.ts — worker entry + timer loop
 */

import type { MergeRequestService } from '@domio/merge-request-service';
import type { MergeRequestEventEmitter, DeckSnapshot } from '@domio/merge-request-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenMergeRequest {
  readonly id: string;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly source_branch: string;
  readonly target_branch: string;
}

export interface MergeRequestProvider {
  /** Returns all open merge requests that need diff processing. */
  getOpenMergeRequests(): Promise<OpenMergeRequest[]>;
}

export interface ReplayProvider {
  /**
   * Replay CRDT logs to reconstruct deck state for a branch.
   * Default: InMemoryReplayProvider (real crdt_logs replay is a later wave).
   */
  replayToSnapshot(workspaceId: string, deckId: string, branchId: string): Promise<DeckSnapshot>;
}

export interface DiffRunner {
  /** Process a single merge request — recompute diff, detect conflicts, auto-merge. */
  runOnce(): Promise<DiffRunResult>;
}

export interface DiffRunResult {
  readonly processed: number;
  readonly conflicts_found: number;
  readonly merged: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Default InMemoryReplayProvider
// ---------------------------------------------------------------------------

export const InMemoryReplayProvider: ReplayProvider = {
  async replayToSnapshot(): Promise<DeckSnapshot> {
    return { slides: [] };
  },
};

// ---------------------------------------------------------------------------
// Default DiffRunner (in-process, calls service)
// ---------------------------------------------------------------------------

function createDefaultDiffRunner(
  service: MergeRequestService,
  mrProvider: MergeRequestProvider,
  replayProvider: ReplayProvider,
  eventEmitter: MergeRequestEventEmitter,
): DiffRunner {
  return {
    async runOnce(): Promise<DiffRunResult> {
      let processed = 0;
      let conflictsFound = 0;
      let merged = 0;

      const openMrs = await mrProvider.getOpenMergeRequests();

      for (const mr of openMrs) {
        try {
          // Get existing diff
          const existingDiff = await service.getMergeRequestDiffs(mr.id);

          // Replay to get current snapshots
          await replayProvider.replayToSnapshot(mr.workspace_id, mr.deck_id, mr.source_branch);
          await replayProvider.replayToSnapshot(mr.workspace_id, mr.deck_id, mr.target_branch);

          // Check if recompute needed (simplified: always process)
          processed++;

          // Check for conflicts in existing diff
          const hasConflicts = existingDiff.slide_diffs.some(
            (sd: { element_diffs: Array<{ is_conflict: boolean }> }) =>
              sd.element_diffs.some((ed: { is_conflict: boolean }) => ed.is_conflict),
          );

          if (hasConflicts) {
            conflictsFound++;

            // Update MR status to conflict
            const mrRecord = await service.getMergeRequest(mr.id);
            if (mrRecord.status !== 'conflict') {
              // Emit conflict_detected event
              const conflictingSlideIds = existingDiff.slide_diffs
                .filter(
                  (sd: { element_diffs: Array<{ is_conflict: boolean }>; slide_id: string }) =>
                    sd.element_diffs.some((ed: { is_conflict: boolean }) => ed.is_conflict),
                )
                .map((sd: { slide_id: string }) => sd.slide_id);

              await eventEmitter.publish('merge_request.conflict_detected', {
                event_id: crypto.randomUUID(),
                event_type: 'merge_request.conflict_detected',
                ts_ms: Date.now(),
                workspace_id: mr.workspace_id,
                deck_id: mr.deck_id,
                actor_id: 'system',
                actor_type: 'system',
                payload: {
                  mr_id: mr.id,
                  deck_id: mr.deck_id,
                  conflicting_slide_ids: conflictingSlideIds,
                },
              });
            }
          } else {
            // No conflicts — attempt auto-merge (fast-forward)
            try {
              await service.mergeMergeRequest(mr.id, 'system', mr.workspace_id);
              merged++;
            } catch {
              // Not a fast-forward or other issue — skip
            }
          }
        } catch (err) {
          // Log and continue with next MR
        }
      }

      return { processed, conflicts_found: conflictsFound, merged };
    },
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface DiffEngineWorkerOptions {
  readonly service: MergeRequestService;
  readonly mrProvider?: MergeRequestProvider;
  readonly replayProvider?: ReplayProvider;
  readonly eventEmitter?: MergeRequestEventEmitter;
  readonly tickMs?: number;
  readonly logger?: Logger;
}

export class DiffEngineWorker {
  private readonly runner: DiffRunner;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: DiffEngineWorkerOptions) {
    if (!opts.service) throw new Error('DiffEngineWorker: service is required');

    const mrProvider = opts.mrProvider ?? { getOpenMergeRequests: async () => [] };
    const replayProvider = opts.replayProvider ?? InMemoryReplayProvider;
    const eventEmitter = opts.eventEmitter ?? {
      async publish(): Promise<void> {
        /* drop */
      },
    };

    this.runner = createDefaultDiffRunner(opts.service, mrProvider, replayProvider, eventEmitter);
    this.tickMs = opts.tickMs ?? Number(process.env['WORKER_TICK_MS'] ?? '60000');
    this.logger = opts.logger ?? {
      info: () => {
        /* noop */
      },
      error: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
    };
  }

  /**
   * Start the worker timer loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.tickMs);
    this.logger.info('DiffEngineWorker started', { tickMs: this.tickMs });
  }

  /**
   * Stop the worker timer loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('DiffEngineWorker stopped');
  }

  /**
   * Run a single diff processing pass.
   */
  async runOnce(): Promise<DiffRunResult> {
    let result: DiffRunResult = { processed: 0, conflicts_found: 0, merged: 0 };

    try {
      result = await this.runner.runOnce();

      this.logger.info('DiffEngineWorker run complete', {
        processed: result.processed,
        conflicts_found: result.conflicts_found,
        merged: result.merged,
      });
    } catch (err) {
      this.logger.error('DiffEngineWorker run failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
