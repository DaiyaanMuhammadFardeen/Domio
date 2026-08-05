/**
 * Video pipeline — jobs tests (Phase 11).
 *
 * Covers:
 * - reduceTransition: valid and invalid transitions
 * - InMemoryJobStore: insert, findById, listByWorkspace, update, dequeue
 * - Priority queue ordering (high > normal > low, FIFO within same)
 * - buildJob: defaults, custom fields, clock injection
 * - JobNotFoundError on missing job
 */

import { describe, it, expect } from 'vitest';
import {
  reduceTransition,
  InMemoryJobStore,
  buildJob,
  createJobId,
} from './jobs.js';
import { InvalidJobTransitionError, JobNotFoundError } from './types.js';
import type { VideoJob } from './types.js';

// ---------------------------------------------------------------------------
// reduceTransition
// ---------------------------------------------------------------------------

describe('reduceTransition', () => {
  it('queued → processing succeeds', () => {
    expect(reduceTransition('queued', 'processing')).toBe('processing');
  });

  it('processing → ready succeeds', () => {
    expect(reduceTransition('processing', 'ready')).toBe('ready');
  });

  it('queued → failed succeeds (cancel)', () => {
    expect(reduceTransition('queued', 'failed')).toBe('failed');
  });

  it('queued → ready throws InvalidJobTransitionError', () => {
    expect(() => reduceTransition('queued', 'ready')).toThrow(InvalidJobTransitionError);
  });

  it('ready → failed throws InvalidJobTransitionError', () => {
    expect(() => reduceTransition('ready', 'failed')).toThrow(InvalidJobTransitionError);
  });

  it('failed → queued throws InvalidJobTransitionError', () => {
    expect(() => reduceTransition('failed', 'queued')).toThrow(InvalidJobTransitionError);
  });
});

// ---------------------------------------------------------------------------
// createJobId
// ---------------------------------------------------------------------------

describe('createJobId', () => {
  it('produces unique IDs with vp- prefix', () => {
    const id1 = createJobId();
    const id2 = createJobId();
    expect(id1).toMatch(/^vp-/);
    expect(id2).toMatch(/^vp-/);
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// buildJob
// ---------------------------------------------------------------------------

describe('buildJob', () => {
  const now = new Date('2026-08-05T00:00:00Z');
  const clock = () => now;

  it('creates a queued job with defaults', () => {
    const { job } = buildJob(
      { videoAssetId: 'asset-1', renditions: ['720p'] },
      { clock },
    );
    expect(job.status).toBe('queued');
    expect(job.priority).toBe('normal');
    expect(job.extractCaptions).toBe(false);
    expect(job.extractWaveform).toBe(false);
    expect(job.createdAt).toBe(now.toISOString());
    expect(job.statusUrl).toMatch(/^\/v1\/video_jobs\//);
  });

  it('honours custom priority and extraction flags', () => {
    const { job } = buildJob(
      {
        videoAssetId: 'asset-2',
        renditions: ['1080p', '720p'],
        priority: 'high',
        extractCaptions: true,
        extractWaveform: true,
      },
      { clock },
    );
    expect(job.priority).toBe('high');
    expect(job.extractCaptions).toBe(true);
    expect(job.extractWaveform).toBe(true);
    expect(job.renditions).toEqual(['1080p', '720p']);
  });

  it('uses caller-provided id', () => {
    const { job } = buildJob(
      { videoAssetId: 'asset-3', renditions: ['480p'] },
      { id: 'custom-id', clock },
    );
    expect(job.id).toBe('custom-id');
  });
});

// ---------------------------------------------------------------------------
// InMemoryJobStore
// ---------------------------------------------------------------------------

function makeJob(overrides?: Partial<VideoJob>): VideoJob {
  return {
    id: 'job-1',
    videoAssetId: 'asset-1',
    renditions: ['720p'],
    extractCaptions: false,
    extractWaveform: false,
    priority: 'normal',
    status: 'queued',
    statusUrl: '/v1/video_jobs/job-1',
    createdAt: '2026-08-05T00:00:00Z',
    ...overrides,
  };
}

describe('InMemoryJobStore', () => {
  it('insert and findById', () => {
    const store = new InMemoryJobStore();
    const job = makeJob();
    store.insert(job, 'ws-1');
    expect(store.findById('job-1')).toBe(job);
  });

  it('findById returns undefined for unknown id', () => {
    const store = new InMemoryJobStore();
    expect(store.findById('nonexistent')).toBeUndefined();
  });

  it('listByWorkspace filters correctly', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j1' }), 'ws-1');
    store.insert(makeJob({ id: 'j2' }), 'ws-2');
    store.insert(makeJob({ id: 'j3' }), 'ws-1');

    const ws1Jobs = store.listByWorkspace('ws-1');
    expect(ws1Jobs).toHaveLength(2);
    expect(ws1Jobs.map((j) => j.id)).toEqual(['j1', 'j3']);

    const ws2Jobs = store.listByWorkspace('ws-2');
    expect(ws2Jobs).toHaveLength(1);
  });

  it('update patches job and returns updated version', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob(), 'ws-1');
    const updated = store.update('job-1', { status: 'processing' });
    expect(updated.status).toBe('processing');
    expect(store.findById('job-1')?.status).toBe('processing');
  });

  it('update throws JobNotFoundError for missing id', () => {
    const store = new InMemoryJobStore();
    expect(() => store.update('nonexistent', { status: 'ready' })).toThrow(JobNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Priority queue (dequeue)
// ---------------------------------------------------------------------------

describe('InMemoryJobStore — priority queue', () => {
  it('dequeues the single queued job', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j1', priority: 'normal' }), 'ws-1');
    const dequeued = store.dequeue();
    expect(dequeued?.id).toBe('j1');
  });

  it('dequeues high priority before normal', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-normal', priority: 'normal' }), 'ws-1');
    store.insert(makeJob({ id: 'j-high', priority: 'high' }), 'ws-1');
    const dequeued = store.dequeue();
    expect(dequeued?.id).toBe('j-high');
  });

  it('dequeues normal priority before low', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-low', priority: 'low' }), 'ws-1');
    store.insert(makeJob({ id: 'j-normal', priority: 'normal' }), 'ws-1');
    const dequeued = store.dequeue();
    expect(dequeued?.id).toBe('j-normal');
  });

  it('dequeues high before low', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-low', priority: 'low' }), 'ws-1');
    store.insert(makeJob({ id: 'j-high', priority: 'high' }), 'ws-1');
    const dequeued = store.dequeue();
    expect(dequeued?.id).toBe('j-high');
  });

  it('FIFO within same priority', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-first', priority: 'normal' }), 'ws-1');
    store.insert(makeJob({ id: 'j-second', priority: 'normal' }), 'ws-1');
    store.insert(makeJob({ id: 'j-third', priority: 'normal' }), 'ws-1');

    expect(store.dequeue()?.id).toBe('j-first');
    // Mark as processing so it's no longer queued
    store.update('j-first', { status: 'processing' });
    expect(store.dequeue()?.id).toBe('j-second');
  });

  it('skips non-queued jobs', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-done', status: 'ready' as never }), 'ws-1');
    store.insert(makeJob({ id: 'j-active', status: 'processing' as never }), 'ws-1');
    store.insert(makeJob({ id: 'j-queued', priority: 'low' }), 'ws-1');

    const dequeued = store.dequeue();
    expect(dequeued?.id).toBe('j-queued');
  });

  it('returns undefined when no queued jobs', () => {
    const store = new InMemoryJobStore();
    store.insert(makeJob({ id: 'j-done', status: 'ready' as never }), 'ws-1');
    expect(store.dequeue()).toBeUndefined();
  });

  it('returns undefined on empty store', () => {
    const store = new InMemoryJobStore();
    expect(store.dequeue()).toBeUndefined();
  });
});
