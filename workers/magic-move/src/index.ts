/**
 * Magic Move worker — entry point (Phase 09).
 *
 * A loop that periodically polls for pending magic-move jobs, runs the
 * compute function, and stores results. Supports graceful shutdown via
 * SIGTERM/SIGINT (mirrors workers/freshness-tracker structure).
 *
 * Public surface:
 *  - {@link startWorker} — starts the periodic poll loop.
 *  - {@link stopWorker} — stops the loop gracefully.
 *  - {@link resetWorkerState} — resets state for testing.
 */

import { MagicMoveWorker, type ComputeFn, type MagicMoveJob, type MagicMoveResult } from './worker.js';

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let worker: MagicMoveWorker | null = null;

export interface WorkerConfig {
  /** Interval between polls in milliseconds (default 5_000). */
  readonly pollIntervalMs?: number;
  /** Function to claim the next pending job. */
  readonly claimJob: () => Promise<MagicMoveJob | null>;
  /** Function to complete a job with results. */
  readonly completeJob: (id: string, tenantId: string, result: MagicMoveResult) => Promise<void>;
  /** Function to fail a job with an error. */
  readonly failJob: (id: string, tenantId: string, error: string) => Promise<void>;
  /** Compute function (default: stub). */
  readonly compute?: ComputeFn;
  /** Callback invoked after each poll cycle. */
  readonly onPoll?: (result: { processed: boolean; error: string | null }) => void;
}

/**
 * Start the magic-move worker.
 *
 * Runs an immediate poll, then schedules periodic polls at the
 * configured interval. Installs SIGTERM/SIGINT handlers for
 * graceful shutdown.
 */
export function startWorker(config: WorkerConfig): { worker: MagicMoveWorker } {
  const pollIntervalMs = config.pollIntervalMs ?? 5_000;
  stopping = false;

  worker = new MagicMoveWorker({
    claimJob: config.claimJob,
    completeJob: config.completeJob,
    failJob: config.failJob,
    ...(config.compute !== undefined ? { compute: config.compute } : {}),
  });

  // Run initial poll
  worker.pollOnce().then((job) => {
    config.onPoll?.({ processed: job !== null, error: worker?.lastError ?? null });
  }).catch(() => {
    // Ignore unhandled rejection in initial poll
  });

  // Schedule periodic polls
  intervalHandle = setInterval(() => {
    if (stopping) return;
    worker?.pollOnce().then((job) => {
      config.onPoll?.({ processed: job !== null, error: worker?.lastError ?? null });
    }).catch(() => {
      // Ignore unhandled rejection in periodic poll
    });
  }, pollIntervalMs);

  // Install signal handlers for graceful shutdown
  const shutdown = (): void => {
    stopWorker();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { worker };
}

/**
 * Stop the worker gracefully.
 * Clears the interval and marks the worker as stopping.
 */
export function stopWorker(): void {
  stopping = true;
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/**
 * Reset worker state (for testing).
 */
export function resetWorkerState(): void {
  stopping = false;
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  worker = null;
}

// Re-export worker types
export { MagicMoveWorker } from './worker.js';
export type { ComputeFn, ComputeInput, MagicMoveJob, MagicMoveResult, ElementMapping, MagicMoveJobStatus } from './worker.js';
