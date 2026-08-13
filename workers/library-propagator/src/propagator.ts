/**
 * Library propagator worker — timer-based auto-update propagation (Phase 18 Wave 3).
 *
 * Periodically checks for bindings that need syncing and applies them.
 * Pattern mirrors refresh-scheduler: in-process setInterval tick loop.
 */

import type { LibraryService } from '@domio/library-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropagationResult {
  readonly applied: number;
  readonly conflict: number;
  readonly errors: number;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const defaultLogger: Logger = {
  info(): void {
    /* noop */
  },
  warn(): void {
    /* noop */
  },
  error(): void {
    /* noop */
  },
};

// ---------------------------------------------------------------------------
// PropagatorWorker
// ---------------------------------------------------------------------------

export class PropagatorWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly service: LibraryService;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private readonly nowFn: () => number;

  constructor(opts: {
    service: LibraryService;
    tickMs?: number;
    logger?: Logger;
    now?: () => number;
  }) {
    if (!opts.service) throw new Error('PropagatorWorker: service is required');
    this.service = opts.service;
    this.tickMs = opts.tickMs ?? 60_000;
    this.logger = opts.logger ?? defaultLogger;
    this.nowFn = opts.now ?? (() => Date.now());
  }

  /**
   * Start the tick loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('propagator.start', { tickMs: this.tickMs });
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
  }

  /**
   * Stop the tick loop and clear the timer.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('propagator.stop');
  }

  /**
   * Run a single propagation pass (public for testing).
   */
  async runOnce(): Promise<PropagationResult> {
    return this.tick();
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async tick(): Promise<PropagationResult> {
    const nowMs = this.nowFn();
    let applied = 0;
    let conflict = 0;
    let errors = 0;

    try {
      const candidates = await this.service.getPropagationCandidates(nowMs);
      this.logger.info('propagator.tick.candidates', { count: candidates.length });

      for (const { binding, latestVersion } of candidates) {
        try {
          const result = await this.service.applyBinding(binding.id, latestVersion, nowMs);
          if (result.applied) {
            applied++;
          } else if (result.reason === 'consumer_conflict') {
            conflict++;
          }
        } catch (e) {
          errors++;
          this.logger.error('propagator.tick.apply_error', {
            binding_id: binding.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      this.logger.error('propagator.tick.fetch_error', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    this.logger.info('propagator.tick.complete', { applied, conflict, errors });
    return { applied, conflict, errors };
  }
}
