/**
 * Freshness tracker worker — entry point (Phase 08 M5).
 *
 * A loop that periodically scans bindings and writes freshness_records.
 * Supports graceful shutdown via SIGTERM/SIGINT.
 *
 * Public surface:
 *  - {@link startWorker} — starts the periodic scan loop.
 *  - {@link stopWorker} — stops the loop gracefully.
 */

import { FreshnessTracker, type BindingConfig, type FreshnessStatus } from './tracker.js';

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;

export interface WorkerConfig {
  /** Interval between scans in milliseconds (default 30_000). */
  readonly scanIntervalMs?: number;
  /** Bindings to track. */
  readonly bindings?: readonly BindingConfig[];
  /** Callback invoked after each scan. */
  readonly onScan?: (results: Array<{ bindingId: string; status: FreshnessStatus }>) => void;
  /** Clock for testing. */
  readonly clock?: () => Date;
}

/**
 * Start the freshness tracker worker.
 *
 * Runs an immediate scan, then schedules periodic scans at the
 * configured interval.  Installs SIGTERM/SIGINT handlers for
 * graceful shutdown.
 */
export function startWorker(config: WorkerConfig = {}): { tracker: FreshnessTracker } {
  const scanIntervalMs = config.scanIntervalMs ?? 30_000;
  const trackerOpts = config.clock !== undefined ? { clock: config.clock } : {};
  const tracker = new FreshnessTracker(trackerOpts);

  // Register bindings
  for (const binding of config.bindings ?? []) {
    tracker.addBinding(binding);
  }

  // Run initial scan
  const results = tracker.scanAll();
  config.onScan?.(results);

  // Schedule periodic scans
  intervalHandle = setInterval(() => {
    if (stopping) return;
    const scanResults = tracker.scanAll();
    config.onScan?.(scanResults);
  }, scanIntervalMs);

  // Install signal handlers for graceful shutdown
  const shutdown = () => {
    stopWorker();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { tracker };
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
}
