/**
 * Video pipeline — handler tests (Phase 11).
 *
 * Covers:
 * - POST /v1/video_jobs → 202 (create job)
 * - POST /v1/video_jobs → 400 (validation: missing fields, invalid rendition, invalid priority)
 * - GET /v1/video_jobs/:id → 200 (get job)
 * - GET /v1/video_jobs/:id → 404 (not found)
 * - GET /v1/video_jobs → 200 (list jobs by workspace)
 * - GET /v1/video_jobs → 400 (missing workspace_id)
 * - DELETE /v1/video_jobs/:id → 204 (cancel queued job)
 * - DELETE /v1/video_jobs/:id → 404 (not found)
 * - DELETE /v1/video_jobs/:id → 409 (cannot cancel ready/failed)
 * - Full lifecycle: create → process → ready
 * - Priority affects dequeue order
 */

import { describe, it, expect } from 'vitest';
import {
  handlers,
  type HttpRequest,
  type VideoPipelineContext,
} from './handlers.js';
import { InMemoryJobStore } from './jobs.js';
import { NoFfmpegBackend } from './transcoder.js';
import type { VideoJob } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides?: Partial<VideoPipelineContext>): VideoPipelineContext {
  const now = new Date('2026-08-05T00:00:00Z');
  return {
    store: new InMemoryJobStore(),
    backend: new NoFfmpegBackend(),
    defaultWorkspaceId: 'ws-test',
    clock: () => now,
    ...overrides,
  };
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers: {} };
}

const DEFAULT_BODY = {
  videoAssetId: 'asset-1',
  renditions: ['720p', '1080p'],
};

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

describe('handlers — createJob', () => {
  it('POST /v1/video_jobs creates a job (202)', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    expect(res.status).toBe(202);
    const job = res.body as VideoJob;
    expect(job.status).toBe('ready'); // NoFfmpegBackend → unsupported → ready
    expect(job.videoAssetId).toBe('asset-1');
    expect(job.renditions).toEqual(['720p', '1080p']);
  });

  it('returns 400 when videoAssetId is missing', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, { renditions: ['720p'] }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when renditions is empty', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, { videoAssetId: 'a', renditions: [] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid rendition', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, { videoAssetId: 'a', renditions: ['4k'] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid priority', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, { ...DEFAULT_BODY, priority: 'urgent' }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('accepts valid priority values', async () => {
    const ctx = makeCtx();
    for (const p of ['low', 'normal', 'high']) {
      const res = await handlers.createJob(
        req('POST', '/v1/video_jobs', {}, { ...DEFAULT_BODY, priority: p }),
        ctx,
      );
      expect(res.status).toBe(202);
    }
  });

  it('accepts extractCaptions and extractWaveform flags', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, {
        ...DEFAULT_BODY,
        extractCaptions: true,
        extractWaveform: true,
      }),
      ctx,
    );
    expect(res.status).toBe(202);
    const job = res.body as VideoJob;
    expect(job.extractCaptions).toBe(true);
    expect(job.extractWaveform).toBe(true);
  });

  it('returns 400 when body is not an object', async () => {
    const ctx = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, 'not an object'),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// getJob
// ---------------------------------------------------------------------------

describe('handlers — getJob', () => {
  it('GET /v1/video_jobs/:id returns job (200)', async () => {
    const ctx = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as VideoJob).id;
    const res = await handlers.getJob(
      req('GET', '/v1/video_jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as VideoJob).id).toBe(jobId);
  });

  it('GET /v1/video_jobs/:id returns 404 for unknown id', async () => {
    const ctx = makeCtx();
    const res = await handlers.getJob(
      req('GET', '/v1/video_jobs/:id', { id: 'nonexistent' }, undefined),
      ctx,
    );
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// listJobs
// ---------------------------------------------------------------------------

describe('handlers — listJobs', () => {
  it('GET /v1/video_jobs returns job list (200)', async () => {
    const ctx = makeCtx();
    await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const res = await handlers.listJobs(
      req('GET', '/v1/video_jobs', {}, undefined, { workspace_id: 'ws-test' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: VideoJob[] }).items).toHaveLength(1);
  });

  it('returns 400 when workspace_id is missing and no default', async () => {
    const ctx = makeCtx({ defaultWorkspaceId: undefined });
    const res = await handlers.listJobs(
      req('GET', '/v1/video_jobs', {}, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('uses defaultWorkspaceId when query param absent', async () => {
    const ctx = makeCtx();
    await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const res = await handlers.listJobs(
      req('GET', '/v1/video_jobs', {}, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: VideoJob[] }).items).toHaveLength(1);
  });

  it('filters by workspace', async () => {
    const ctx = makeCtx();
    // Create in ws-test
    await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    // List different workspace
    const res = await handlers.listJobs(
      req('GET', '/v1/video_jobs', {}, undefined, { workspace_id: 'ws-other' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: VideoJob[] }).items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// cancelJob
// ---------------------------------------------------------------------------

describe('handlers — cancelJob', () => {
  it('DELETE /v1/video_jobs/:id cancels a job (204)', async () => {
    const ctx = makeCtx({ backend: new NoFfmpegBackend() });
    const created = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    // Reset job to queued for cancel test
    const jobId = (created.body as VideoJob).id;
    ctx.store.update(jobId, { status: 'queued' });

    const res = await handlers.cancelJob(
      req('DELETE', '/v1/video_jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(res.status).toBe(204);
  });

  it('DELETE /v1/video_jobs/:id returns 404 for unknown id', async () => {
    const ctx = makeCtx();
    const res = await handlers.cancelJob(
      req('DELETE', '/v1/video_jobs/:id', { id: 'nonexistent' }, undefined),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when cancelling a ready job', async () => {
    const ctx = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as VideoJob).id;
    // Job is already ready after createJob with NoFfmpegBackend

    const res = await handlers.cancelJob(
      req('DELETE', '/v1/video_jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('CANCEL_CONFLICT');
  });

  it('returns 409 when cancelling a failed job', async () => {
    const ctx = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as VideoJob).id;
    ctx.store.update(jobId, { status: 'failed' });

    const res = await handlers.cancelJob(
      req('DELETE', '/v1/video_jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle
// ---------------------------------------------------------------------------

describe('handlers — full lifecycle', () => {
  it('create → get → verify status', async () => {
    const ctx = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as VideoJob).id;

    const fetched = await handlers.getJob(
      req('GET', '/v1/video_jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(fetched.status).toBe(200);
    expect((fetched.body as VideoJob).id).toBe(jobId);
    expect((fetched.body as VideoJob).status).toBe('ready');
  });

  it('create multiple → list → correct count', async () => {
    const ctx = makeCtx();
    await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, DEFAULT_BODY),
      ctx,
    );
    await handlers.createJob(
      req('POST', '/v1/video_jobs', {}, { ...DEFAULT_BODY, videoAssetId: 'asset-2' }),
      ctx,
    );

    const listed = await handlers.listJobs(
      req('GET', '/v1/video_jobs', {}, undefined, { workspace_id: 'ws-test' }),
      ctx,
    );
    expect((listed.body as { items: VideoJob[] }).items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Priority integration
// ---------------------------------------------------------------------------

describe('handlers — priority integration', () => {
  it('high priority job dequeued first', () => {
    const store = new InMemoryJobStore();
    const now = new Date('2026-08-05T00:00:00Z');

    // Insert jobs manually with different priorities
    const { job: lowJob } = {
      job: {
        id: 'low-1', videoAssetId: 'a', renditions: ['720p'] as const,
        extractCaptions: false, extractWaveform: false, priority: 'low' as const,
        status: 'queued' as const, statusUrl: '/v1/video_jobs/low-1',
        createdAt: now.toISOString(),
      },
    };
    const { job: highJob } = {
      job: {
        id: 'high-1', videoAssetId: 'a', renditions: ['1080p'] as const,
        extractCaptions: false, extractWaveform: false, priority: 'high' as const,
        status: 'queued' as const, statusUrl: '/v1/video_jobs/high-1',
        createdAt: now.toISOString(),
      },
    };

    store.insert(lowJob, 'ws-test');
    store.insert(highJob, 'ws-test');

    const first = store.dequeue();
    expect(first?.id).toBe('high-1');
    expect(first?.priority).toBe('high');
  });
});
