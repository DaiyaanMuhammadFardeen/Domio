/**
 * Video pipeline — job lifecycle and in-memory store (Phase 11).
 *
 * Pure reducer for state transitions:  queued → processing → ready | failed
 * Invalid transitions are rejected.
 *
 * InMemoryJobStore provides insert/find/list/update/dequeue with a
 * FIFO-with-priority queue (high > normal > low).
 */

import type { CreateVideoJobInput, Rendition, VideoJob, VideoJobStatus } from './types.js';
import {
  InvalidJobTransitionError,
  JobNotFoundError,
  PRIORITY_ORDER,
  isValidTransition,
} from './types.js';

// ---------------------------------------------------------------------------
// Pure transition reducer
// ---------------------------------------------------------------------------

/**
 * Attempt a status transition.  Returns the new status or throws
 * `InvalidJobTransitionError` if the transition is illegal.
 */
export function reduceTransition(current: VideoJobStatus, target: VideoJobStatus): VideoJobStatus {
  if (!isValidTransition(current, target)) {
    throw new InvalidJobTransitionError(current, target);
  }
  return target;
}

// ---------------------------------------------------------------------------
// In-memory job store with priority queue
// ---------------------------------------------------------------------------

export interface VideoJobStore {
  insert(job: VideoJob, workspaceId: string): void;
  findById(id: string): VideoJob | undefined;
  listByWorkspace(workspaceId: string): VideoJob[];
  update(id: string, patch: Partial<VideoJob>): VideoJob;
  /** Dequeue the highest-priority queued job (FIFO within same priority). */
  dequeue(): VideoJob | undefined;
}

interface StoredJob {
  job: VideoJob;
  workspaceId: string;
  enqueuedAt: number; // monotonic counter for FIFO ordering
}

export class InMemoryJobStore implements VideoJobStore {
  private readonly jobs = new Map<string, StoredJob>();
  private enqueueCounter = 0;

  insert(job: VideoJob, workspaceId: string): void {
    this.enqueueCounter++;
    this.jobs.set(job.id, { job, workspaceId, enqueuedAt: this.enqueueCounter });
  }

  findById(id: string): VideoJob | undefined {
    return this.jobs.get(id)?.job;
  }

  listByWorkspace(workspaceId: string): VideoJob[] {
    return [...this.jobs.values()].filter((s) => s.workspaceId === workspaceId).map((s) => s.job);
  }

  update(id: string, patch: Partial<VideoJob>): VideoJob {
    const stored = this.jobs.get(id);
    if (!stored) throw new JobNotFoundError(id);
    const updated = { ...stored.job, ...patch } as VideoJob;
    stored.job = updated;
    return updated;
  }

  dequeue(): VideoJob | undefined {
    let best: StoredJob | undefined;
    for (const stored of this.jobs.values()) {
      if (stored.job.status !== 'queued') continue;
      if (
        !best ||
        PRIORITY_ORDER[stored.job.priority] < PRIORITY_ORDER[best.job.priority] ||
        (PRIORITY_ORDER[stored.job.priority] === PRIORITY_ORDER[best.job.priority] &&
          stored.enqueuedAt < best.enqueuedAt)
      ) {
        best = stored;
      }
    }
    return best?.job;
  }
}

// ---------------------------------------------------------------------------
// Job factory
// ---------------------------------------------------------------------------

let idCounter = 0;

export function createJobId(): string {
  idCounter++;
  return `vp-${idCounter.toString(36).padStart(8, '0')}`;
}

export function buildJob(
  input: CreateVideoJobInput,
  opts?: { id?: string; workspaceId?: string; clock?: () => Date },
): { job: VideoJob; workspaceId: string } {
  const id = opts?.id ?? createJobId();
  const now = (opts?.clock ?? (() => new Date()))();
  const job: VideoJob = {
    id,
    videoAssetId: input.videoAssetId,
    renditions: [...input.renditions] as readonly Rendition[],
    extractCaptions: input.extractCaptions ?? false,
    extractWaveform: input.extractWaveform ?? false,
    priority: input.priority ?? 'normal',
    status: 'queued',
    statusUrl: `/v1/video_jobs/${id}`,
    createdAt: now.toISOString(),
  };
  return { job, workspaceId: opts?.workspaceId ?? input.videoAssetId };
}
