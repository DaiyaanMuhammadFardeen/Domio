/**
 * Magic Move service tests — covers job CRUD, status transitions,
 * worker claim/complete/fail, and cancellation.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryMagicMoveJobRepository } from './dal.js';
import { MagicMoveService } from './service.js';

function makeService() {
  const jobs = new InMemoryMagicMoveJobRepository();
  let idCounter = 0;
  const service = new MagicMoveService({
    jobs,
    idGenerator: () => `job-${++idCounter}`,
    clock: () => new Date(1000),
  });
  return { service, jobs };
}

describe('MagicMoveService — createJob', () => {
  it('creates a pending job with all fields', async () => {
    const { service } = makeService();
    const job = await service.createJob({
      tenantId: 't1',
      deckId: 'd1',
      fromSlideId: 's1',
      toSlideId: 's2',
    });
    expect(job.id).toBe('job-1');
    expect(job.tenantId).toBe('t1');
    expect(job.deckId).toBe('d1');
    expect(job.fromSlideId).toBe('s1');
    expect(job.toSlideId).toBe('s2');
    expect(job.status).toBe('pending');
    expect(job.result).toBeUndefined();
    expect(job.error).toBeUndefined();
  });
});

describe('MagicMoveService — getJob', () => {
  it('returns job by id and tenant', async () => {
    const { service } = makeService();
    const created = await service.createJob({
      tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2',
    });
    const fetched = await service.getJob(created.id, 't1');
    expect(fetched.id).toBe(created.id);
  });

  it('throws for unknown job', async () => {
    const { service } = makeService();
    await expect(service.getJob('unknown', 't1')).rejects.toThrow('not found');
  });
});

describe('MagicMoveService — listJobs', () => {
  it('lists jobs for a tenant', async () => {
    const { service } = makeService();
    await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's2', toSlideId: 's3' });
    await service.createJob({ tenantId: 't2', deckId: 'd2', fromSlideId: 's1', toSlideId: 's2' });

    const t1Jobs = await service.listJobs('t1');
    expect(t1Jobs).toHaveLength(2);
  });

  it('filters by status', async () => {
    const { service } = makeService();
    const j1 = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's2', toSlideId: 's3' });
    await service.completeJob(j1.id, 't1', {
      elementMappings: [],
      matchedCount: 0,
      unmatchedFromCount: 0,
      unmatchedToCount: 0,
    });

    const pending = await service.listJobs('t1', { status: 'pending' });
    expect(pending).toHaveLength(1);
    const done = await service.listJobs('t1', { status: 'done' });
    expect(done).toHaveLength(1);
  });
});

describe('MagicMoveService — cancelJob', () => {
  it('cancels a pending job', async () => {
    const { service } = makeService();
    const j = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    const cancelled = await service.cancelJob(j.id, 't1');
    expect(cancelled.status).toBe('failed');
    expect(cancelled.error).toBe('Cancelled by user');
  });

  it('throws for completed job', async () => {
    const { service } = makeService();
    const j = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    await service.completeJob(j.id, 't1', {
      elementMappings: [], matchedCount: 0, unmatchedFromCount: 0, unmatchedToCount: 0,
    });
    await expect(service.cancelJob(j.id, 't1')).rejects.toThrow('cannot be cancelled');
  });
});

describe('MagicMoveService — claimNextJob', () => {
  it('claims the oldest pending job', async () => {
    const jobs = new InMemoryMagicMoveJobRepository();
    let t = 1000;
    const service = new MagicMoveService({
      jobs,
      idGenerator: () => `job-${Math.random().toString(36).slice(2, 8)}`,
      clock: () => new Date(t),
    });
    const j1 = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    t = 2000;
    await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's2', toSlideId: 's3' });

    const claimed = await service.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(j1.id);
    expect(claimed!.status).toBe('computing');
  });

  it('returns null when no pending jobs', async () => {
    const { service } = makeService();
    const claimed = await service.claimNextJob();
    expect(claimed).toBeNull();
  });

  it('skips non-pending jobs', async () => {
    const { service } = makeService();
    const j1 = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    await service.completeJob(j1.id, 't1', {
      elementMappings: [], matchedCount: 0, unmatchedFromCount: 0, unmatchedToCount: 0,
    });

    const claimed = await service.claimNextJob();
    expect(claimed).toBeNull();
  });
});

describe('MagicMoveService — completeJob', () => {
  it('stores result and marks done', async () => {
    const { service } = makeService();
    const j = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    const result = {
      elementMappings: [
        { fromElementId: 'e1', toElementId: 'e1', matchType: 'exact' as const, confidence: 1.0 },
      ],
      matchedCount: 1,
      unmatchedFromCount: 0,
      unmatchedToCount: 0,
    };
    const completed = await service.completeJob(j.id, 't1', result);
    expect(completed.status).toBe('done');
    expect(completed.result).toEqual(result);
  });
});

describe('MagicMoveService — failJob', () => {
  it('stores error and marks failed', async () => {
    const { service } = makeService();
    const j = await service.createJob({ tenantId: 't1', deckId: 'd1', fromSlideId: 's1', toSlideId: 's2' });
    const failed = await service.failJob(j.id, 't1', 'Compute timeout');
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('Compute timeout');
  });
});
