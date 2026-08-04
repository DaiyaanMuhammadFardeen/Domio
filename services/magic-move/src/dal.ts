/**
 * Magic Move — persistence layer (Phase 09).
 *
 * Repository interface + in-memory implementation for magic-move jobs.
 * Jobs are submitted via the service, polled by the worker, and
 * store computed element-mapping results.
 */

// ---------------------------------------------------------------------------
// Domain records
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

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface MagicMoveJobRepository {
  insert(job: MagicMoveJob): Promise<void>;
  findById(id: string, tenantId: string): Promise<MagicMoveJob | null>;
  listByTenant(tenantId: string, filters?: { status?: MagicMoveJobStatus; limit?: number }): Promise<MagicMoveJob[]>;
  updateStatus(id: string, tenantId: string, status: MagicMoveJobStatus, patch?: Partial<Pick<MagicMoveJob, 'result' | 'error'>>): Promise<MagicMoveJob>;
  claimNextPending(): Promise<MagicMoveJob | null>;
  delete(id: string, tenantId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MagicMoveJobNotFoundError extends Error {
  readonly code = 'MAGIC_MOVE_JOB_NOT_FOUND' as const;
  constructor(public readonly jobId: string) {
    super(`Magic move job ${jobId} not found`);
    this.name = 'MagicMoveJobNotFoundError';
  }
}

export class JobAlreadyCompletedError extends Error {
  readonly code = 'JOB_ALREADY_COMPLETED' as const;
  constructor(public readonly jobId: string) {
    super(`Magic move job ${jobId} is already completed or failed`);
    this.name = 'JobAlreadyCompletedError';
  }
}

export class JobNotCancellableError extends Error {
  readonly code = 'JOB_NOT_CANCELLABLE' as const;
  constructor(public readonly jobId: string, public readonly status: MagicMoveJobStatus) {
    super(`Magic move job ${jobId} cannot be cancelled (status: ${status})`);
    this.name = 'JobNotCancellableError';
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryMagicMoveJobRepository implements MagicMoveJobRepository {
  private store = new Map<string, MagicMoveJob>();

  private key(job: MagicMoveJob): string {
    return `${job.tenantId}::${job.id}`;
  }

  async insert(job: MagicMoveJob): Promise<void> {
    this.store.set(this.key(job), job);
  }

  async findById(id: string, tenantId: string): Promise<MagicMoveJob | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByTenant(
    tenantId: string,
    filters?: { status?: MagicMoveJobStatus; limit?: number },
  ): Promise<MagicMoveJob[]> {
    const limit = filters?.limit ?? 20;
    const out: MagicMoveJob[] = [];
    for (const job of this.store.values()) {
      if (job.tenantId !== tenantId) continue;
      if (filters?.status && job.status !== filters.status) continue;
      out.push(job);
      if (out.length >= limit) break;
    }
    return out;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: MagicMoveJobStatus,
    patch?: Partial<Pick<MagicMoveJob, 'result' | 'error'>>,
  ): Promise<MagicMoveJob> {
    const existing = this.store.get(`${tenantId}::${id}`);
    if (!existing) throw new MagicMoveJobNotFoundError(id);

    const updated: MagicMoveJob = {
      ...existing,
      status,
      ...(patch?.result !== undefined ? { result: patch.result } : {}),
      ...(patch?.error !== undefined ? { error: patch.error } : {}),
      updatedAt: new Date(),
    };
    this.store.set(this.key(updated), updated);
    return updated;
  }

  async claimNextPending(): Promise<MagicMoveJob | null> {
    let oldest: MagicMoveJob | null = null;
    for (const job of this.store.values()) {
      if (job.status !== 'pending') continue;
      if (oldest === null || job.createdAt.getTime() < oldest.createdAt.getTime()) {
        oldest = job;
      }
    }
    if (oldest !== null) {
      oldest = { ...oldest, status: 'computing' as const, updatedAt: new Date() };
      this.store.set(this.key(oldest), oldest);
    }
    return oldest;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }

  /** Reset internal state (for testing). */
  reset(): void {
    this.store.clear();
  }
}
