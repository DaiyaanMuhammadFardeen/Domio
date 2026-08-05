/**
 * @domio/cad-jobs — In-process worker simulator.
 *
 * In production, the actual CAD pipeline (`workers/cad-pipeline/`) is a
 * Go worker pool using OpenCASCADE for STEP/IGES and Assimp for FBX.
 * This in-process simulator is the dev/test fallback so the API surface
 * is fully exercisable without the heavy external runtime.
 *
 * The simulator:
 *   - Drives progress parsing → meshing → optimizing → done
 *   - Honors a configurable failure rate for negative tests
 *   - Records the produced resultUrl and finishedAt
 *   - Runs asynchronously on process.nextTick so the API returns 201
 *     immediately while the work continues in the background
 */

import type { CadJobRepository } from './repo.js';
import type { CadJob, CadProgress } from './types.js';

export interface WorkerSimulatorConfig {
  /** Failure rate in [0,1] for testing. Default 0. */
  readonly failureRate?: number;
  /** ms per progress stage. Defaults to a fast dev loop. */
  readonly stageDelayMs?: number;
  /** Result URL prefix. Default CDN-style placeholder. */
  readonly resultUrlPrefix?: string;
  /** Custom id generator for synthetic jobs. */
  readonly idGenerator?: () => string;
}

export type ProgressListener = (job: CadJob) => void;

export class CadWorkerSimulator {
  private listeners: ProgressListener[] = [];
  private inflight = new Map<string, AbortController>();

  constructor(
    private readonly repo: CadJobRepository,
    private readonly config: WorkerSimulatorConfig = {},
  ) {}

  onProgress(listener: ProgressListener): void {
    this.listeners.push(listener);
  }

  private getFailureRate(): number {
    return this.config.failureRate ?? 0;
  }

  private getStageDelayMs(): number {
    return this.config.stageDelayMs ?? 5;
  }

  private getResultUrlPrefix(): string {
    return this.config.resultUrlPrefix ?? 'https://cdn.domio.app/cad/';
  }

  /**
   * Start processing a freshly created job. Returns immediately; the
   * progress transitions happen asynchronously.
   */
  async start(jobId: string): Promise<void> {
    const ac = new AbortController();
    this.inflight.set(jobId, ac);
    try {
      await this.drive(jobId, ac.signal);
    } finally {
      this.inflight.delete(jobId);
    }
  }

  cancel(jobId: string): boolean {
    const ac = this.inflight.get(jobId);
    if (!ac) return false;
    ac.abort();
    this.inflight.delete(jobId);
    return true;
  }

  private async drive(jobId: string, signal: AbortSignal): Promise<void> {
    const stages: ReadonlyArray<CadProgress> = ['parsing', 'meshing', 'optimizing', 'done'];
    // Pre-pull a failure decision so we don't depend on the wrong state.
    const willFail = Math.random() < this.getFailureRate();
    if (willFail) {
      await this.advance(jobId, 'failed', this.getResultUrlPrefix(), signal, 'simulated conversion failure');
      return;
    }

    for (const stage of stages) {
      const ok = await this.delay(this.getStageDelayMs(), signal);
      if (!ok) return;
      const resultUrl =
        stage === 'done' ? `${this.getResultUrlPrefix()}${jobId}.glb` : undefined;
      await this.advance(jobId, stage, resultUrl, signal);
    }
  }

  private async advance(
    jobId: string,
    progress: CadProgress,
    resultUrl: string | undefined,
    signal: AbortSignal,
    errorMessage?: string,
  ): Promise<void> {
    if (signal.aborted) return;
    const patch: { progress: CadProgress; resultUrl?: string | null; finishedAt?: string; errorMessage?: string | null } = {
      progress,
    };
    if (progress === 'done') {
      patch.resultUrl = resultUrl ?? null;
      patch.finishedAt = new Date().toISOString();
    } else if (progress === 'failed') {
      patch.errorMessage = errorMessage ?? null;
      patch.finishedAt = new Date().toISOString();
    }
    const updated = await this.repo.update(jobId, patch);
    for (const listener of this.listeners) {
      try {
        listener(updated);
      } catch {
        // Listener errors must not break the worker.
      }
    }
  }

  /**
   * Returns true when the timer fired, false when the signal aborted.
   * Silently swallows cancellation so callers don't have to wrap every
   * delay in a try/catch.
   */
  private delay(ms: number, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve(true);
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}