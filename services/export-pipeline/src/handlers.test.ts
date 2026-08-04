/**
 * Export pipeline — handler tests (Phase 09).
 *
 * Covers:
 * - POST /v1/export/jobs → 201
 * - GET /v1/export/jobs/:id → 200/404
 * - GET /v1/export/jobs → 200 list
 * - DELETE /v1/export/jobs/:id → 204 cancel
 * - 401 unauthorized
 */

import { describe, it, expect } from 'vitest';
import { handlers, type HttpRequest, type ExportHandlerContext } from './handlers.js';
import { ExportService, type ExportJobRepository } from './service.js';
import { ExportMetrics } from './metrics.js';
import { InMemoryExportAuditRecorder } from './audit.js';
import type { Encoder, ExportFrame, ExportJob, FrameSource, CreateExportJobInput } from './types.js';
import { JobNotFoundError } from './types.js';

// ---------------------------------------------------------------------------
// In-memory job repository
// ---------------------------------------------------------------------------

class InMemoryJobRepository implements ExportJobRepository {
  private jobs = new Map<string, ExportJob>();

  async insert(job: ExportJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async findById(id: string): Promise<ExportJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async listByTenant(tenantId: string): Promise<ExportJob[]> {
    return [...this.jobs.values()].filter((j) => j.tenantId === tenantId);
  }

  async update(id: string, patch: Partial<ExportJob>): Promise<ExportJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new JobNotFoundError(id);
    const updated = { ...existing, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeSolidFrame(w: number, h: number, r: number, g: number, b: number): ExportFrame {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

const fakeFrameSource: FrameSource = {
  async resolveFrames(_deckId, range): Promise<ExportFrame[]> {
    const count = range.end - range.start + 1;
    return Array.from({ length: count }, () => makeSolidFrame(2, 2, 128, 128, 128));
  },
};

const fakeEncoder: Encoder = {
  async encodeVideo(): Promise<Uint8Array> {
    return new Uint8Array([0x00, 0x01, 0x02]);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx() {
  let counter = 0;
  const idGen = () => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return `${ts}${rand}` as never;
  };
  const now = new Date('2026-08-02T00:00:00Z');
  const clock = () => now;
  const jobs = new InMemoryJobRepository();
  const metrics = new ExportMetrics();
  const audit = new InMemoryExportAuditRecorder(clock);
  const svc = new ExportService({
    jobs,
    encoder: fakeEncoder,
    frameSource: fakeFrameSource,
    metrics,
    audit,
    idGenerator: idGen as () => never,
    clock,
  });
  return {
    svc,
    ctx: { service: svc, metrics, audit } as ExportHandlerContext,
    metrics,
    audit,
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

const DEFAULT_BODY: CreateExportJobInput & { actorId?: string } = {
  tenantId: 'tenant-1',
  deckId: 'deck-1',
  format: 'gif',
  range: { start: 0, end: 4 },
  scale: 1,
  fps: 10,
  actorId: 'alice',
};

describe('export handlers — createJob', () => {
  it('POST /v1/export/jobs creates a job (201)', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, DEFAULT_BODY),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as ExportJob).status).toBe('queued');
  });

  it('returns 401 when no actorId', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, { ...DEFAULT_BODY, actorId: undefined }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('export handlers — getJob', () => {
  it('GET /v1/export/jobs/:id returns job (200)', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as ExportJob).id;
    const res = await handlers.getJob(
      req('GET', '/v1/export/jobs/:id', { id: jobId }, undefined),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as ExportJob).id).toBe(jobId);
  });

  it('GET /v1/export/jobs/:id returns 404 for unknown', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getJob(
      req('GET', '/v1/export/jobs/:id', { id: 'nonexistent' }, undefined),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe('export handlers — listJobs', () => {
  it('GET /v1/export/jobs returns job list (200)', async () => {
    const { ctx } = makeCtx();
    await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const res = await handlers.listJobs(
      req('GET', '/v1/export/jobs', {}, undefined, { tenantId: 'tenant-1' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { jobs: ExportJob[] }).jobs).toHaveLength(1);
  });

  it('returns 400 when tenantId missing', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.listJobs(
      req('GET', '/v1/export/jobs', {}, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

describe('export handlers — cancelJob', () => {
  it('DELETE /v1/export/jobs/:id cancels queued job (204)', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as ExportJob).id;
    const res = await handlers.cancelJob(
      req('DELETE', '/v1/export/jobs/:id', { id: jobId }, undefined, { actorId: 'alice' }),
      ctx,
    );
    expect(res.status).toBe(204);
  });

  it('DELETE /v1/export/jobs/:id returns 404 for unknown', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.cancelJob(
      req('DELETE', '/v1/export/jobs/:id', { id: 'nonexistent' }, undefined, { actorId: 'alice' }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe('export handlers — unauthorized', () => {
  it('cancelJob returns 401 when no actorId', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createJob(
      req('POST', '/v1/export/jobs', {}, DEFAULT_BODY),
      ctx,
    );
    const jobId = (created.body as ExportJob).id;
    const res = await handlers.cancelJob(
      req('DELETE', '/v1/export/jobs/:id', { id: jobId }, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});
