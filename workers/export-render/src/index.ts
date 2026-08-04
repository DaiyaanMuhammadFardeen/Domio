/**
 * Export render worker — entry point (Phase 09).
 *
 * A loop that periodically polls for queued export jobs and renders them.
 * Supports graceful shutdown via SIGTERM/SIGINT.
 *
 * Public surface:
 *  - {@link startWorker} — starts the polling loop.
 *  - {@link stopWorker} — stops the loop gracefully.
 *  - {@link resetWorkerState} — resets worker state (for testing).
 */

import { ExportRenderWorker, type ExportRenderWorkerOptions } from './worker.js';

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let worker: ExportRenderWorker | null = null;

/**
 * Start the export render worker.
 */
export function startWorker(config: ExportRenderWorkerOptions): ExportRenderWorker {
  if (worker?.isRunning()) {
    return worker;
  }

  worker = new ExportRenderWorker(config);
  worker.start();
  return worker;
}

/**
 * Stop the worker gracefully.
 */
export function stopWorker(): void {
  if (worker) {
    worker.stop();
    worker = null;
  }
}

/**
 * Reset worker state (for testing).
 */
export function resetWorkerState(): void {
  if (worker) {
    worker.stop();
    worker = null;
  }
}

export { ExportRenderWorker, type ExportRenderWorkerOptions, type ExportJob, type ExportJobRepository, type ExportJobStatus } from './worker.js';
