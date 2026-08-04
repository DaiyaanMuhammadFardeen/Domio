/**
 * Magic Move — service layer (Phase 09).
 *
 * Core business logic for magic-move compute jobs:
 *   - Create jobs (submit two slides to morph)
 *   - Get / list / cancel jobs
 *   - Claim jobs for worker processing
 *   - Store compute results
 */

import type {
  MagicMoveJob,
  MagicMoveJobStatus,
  MagicMoveJobRepository,
  MagicMoveResult,
} from './dal.js';
import {
  MagicMoveJobNotFoundError,
  JobNotCancellableError,
} from './dal.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MagicMoveServiceOptions {
  readonly jobs: MagicMoveJobRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

const defaultId = (): string => {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 16)]!;
  return out;
};

const defaultClock = (): Date => new Date();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MagicMoveService {
  private readonly jobs: MagicMoveJobRepository;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: MagicMoveServiceOptions) {
    this.jobs = opts.jobs;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Job CRUD
  // -------------------------------------------------------------------------

  async createJob(input: {
    tenantId: string;
    deckId: string;
    fromSlideId: string;
    toSlideId: string;
  }): Promise<MagicMoveJob> {
    const now = this.clock();
    const job: MagicMoveJob = {
      id: this.idGen(),
      tenantId: input.tenantId,
      deckId: input.deckId,
      fromSlideId: input.fromSlideId,
      toSlideId: input.toSlideId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await this.jobs.insert(job);
    return job;
  }

  async getJob(id: string, tenantId: string): Promise<MagicMoveJob> {
    const job = await this.jobs.findById(id, tenantId);
    if (!job) throw new MagicMoveJobNotFoundError(id);
    return job;
  }

  async listJobs(
    tenantId: string,
    filters?: { status?: MagicMoveJobStatus; limit?: number },
  ): Promise<MagicMoveJob[]> {
    return this.jobs.listByTenant(tenantId, filters);
  }

  async cancelJob(id: string, tenantId: string): Promise<MagicMoveJob> {
    const job = await this.getJob(id, tenantId);
    if (job.status === 'done' || job.status === 'failed') {
      throw new JobNotCancellableError(id, job.status);
    }
    return this.jobs.updateStatus(id, tenantId, 'failed', {
      error: 'Cancelled by user',
    });
  }

  // -------------------------------------------------------------------------
  // Worker-facing operations
  // -------------------------------------------------------------------------

  /** Claim the next pending job (atomically transitions to computing). */
  async claimNextJob(): Promise<MagicMoveJob | null> {
    return this.jobs.claimNextPending();
  }

  /** Mark a job as done with computed results. */
  async completeJob(id: string, tenantId: string, result: MagicMoveResult): Promise<MagicMoveJob> {
    return this.jobs.updateStatus(id, tenantId, 'done', { result });
  }

  /** Mark a job as failed with an error message. */
  async failJob(id: string, tenantId: string, error: string): Promise<MagicMoveJob> {
    return this.jobs.updateStatus(id, tenantId, 'failed', { error });
  }
}
