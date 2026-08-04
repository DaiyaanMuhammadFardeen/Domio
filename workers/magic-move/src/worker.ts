/**
 * Magic Move worker — compute logic (Phase 09).
 *
 * Polls for pending jobs, runs the compute function, and stores results.
 * The compute function is injected for testability.
 */

// ---------------------------------------------------------------------------
// Types (duplicated from service to avoid cross-package imports)
// ---------------------------------------------------------------------------

export type MagicMoveJobStatus = 'pending' | 'computing' | 'done' | 'failed';

export interface ElementMapping {
  readonly fromElementId: string;
  readonly toElementId: string;
  readonly matchType: 'exact' | 'morph' | 'new' | 'removed';
  readonly confidence: number;
  readonly path?: ReadonlyArray<{
    readonly timeMs: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly opacity: number;
  }>;
}

export interface MagicMoveResult {
  readonly elementMappings: readonly ElementMapping[];
  readonly matchedCount: number;
  readonly unmatchedFromCount: number;
  readonly unmatchedToCount: number;
}

export interface MagicMoveJob {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly fromSlideId: string;
  readonly toSlideId: string;
  readonly status: MagicMoveJobStatus;
  readonly result?: MagicMoveResult;
  readonly error?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ComputeInput {
  readonly jobId: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly fromSlideId: string;
  readonly toSlideId: string;
}

export type ComputeFn = (input: ComputeInput) => Promise<MagicMoveResult>;

export interface MagicMoveWorkerState {
  readonly isRunning: boolean;
  readonly processedCount: number;
  readonly lastError: string | null;
}

// ---------------------------------------------------------------------------
// Default compute function (stub — matches elements by id)
// ---------------------------------------------------------------------------

export const defaultCompute: ComputeFn = async (_input) => {
  // Stub implementation: returns an empty mapping.
  // Real implementation would compare slide element trees and compute morphs.
  return {
    elementMappings: [],
    matchedCount: 0,
    unmatchedFromCount: 0,
    unmatchedToCount: 0,
  };
};

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface MagicMoveWorkerOptions {
  /** Function to claim the next pending job. */
  readonly claimJob: () => Promise<MagicMoveJob | null>;
  /** Function to complete a job with results. */
  readonly completeJob: (id: string, tenantId: string, result: MagicMoveResult) => Promise<void>;
  /** Function to fail a job with an error. */
  readonly failJob: (id: string, tenantId: string, error: string) => Promise<void>;
  /** Compute function (default: stub). */
  readonly compute?: ComputeFn;
}

export class MagicMoveWorker {
  private readonly claimJob: () => Promise<MagicMoveJob | null>;
  private readonly completeJob: (id: string, tenantId: string, result: MagicMoveResult) => Promise<void>;
  private readonly failJob: (id: string, tenantId: string, error: string) => Promise<void>;
  private readonly computeFn: ComputeFn;
  private _processedCount = 0;
  private _lastError: string | null = null;

  constructor(opts: MagicMoveWorkerOptions) {
    this.claimJob = opts.claimJob;
    this.completeJob = opts.completeJob;
    this.failJob = opts.failJob;
    this.computeFn = opts.compute ?? defaultCompute;
  }

  /** Number of jobs processed since construction. */
  get processedCount(): number {
    return this._processedCount;
  }

  /** Last error message, or null if no errors. */
  get lastError(): string | null {
    return this._lastError;
  }

  /**
   * Process a single poll cycle.
   *
   * Claims the next pending job, runs compute, and stores the result.
   * Returns the processed job, or null if no pending jobs were available.
   */
  async pollOnce(): Promise<MagicMoveJob | null> {
    const job = await this.claimJob();
    if (!job) return null;

    try {
      const result = await this.computeFn({
        jobId: job.id,
        tenantId: job.tenantId,
        deckId: job.deckId,
        fromSlideId: job.fromSlideId,
        toSlideId: job.toSlideId,
      });

      await this.completeJob(job.id, job.tenantId, result);
      this._processedCount++;
      this._lastError = null;
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._lastError = message;
      await this.failJob(job.id, job.tenantId, message);
      this._processedCount++;
      return job;
    }
  }
}
