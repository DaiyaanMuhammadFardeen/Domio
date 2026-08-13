/**
 * Export pipeline — service tests (Phase 09).
 *
 * Covers:
 * - Job lifecycle: queued → rendering → encoding → ready
 * - Rejected transition throws
 * - Failed terminal
 * - Cancel from queued/rendering works
 * - Cancel from ready/failed throws
 * - createJob validates format/range/fps
 * - renderJob happy path with fake FrameSource
 * - Artifact saved, audit recorded
 */

import { describe, it, expect } from 'vitest';
import { ExportService, type ExportJobRepository, type ExportServiceOptions } from './service.js';
import { ExportMetrics } from './metrics.js';
import { InMemoryExportAuditRecorder } from './audit.js';
import {
  ExportBudgetError,
  InvalidJobTransitionError,
  JobNotFoundError,
  ValidationError,
  type Encoder,
  type ExportFrame,
  type ExportJob,
  type FrameSource,
  type CreateExportJobInput,
} from './types.js';

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
// Fake frame source
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

function createFakeFrameSource(): FrameSource {
  return {
    async resolveFrames(_deckId, range, _scale): Promise<ExportFrame[]> {
      const count = range.end - range.start + 1;
      return Array.from({ length: count }, (_, i) =>
        makeSolidFrame(4, 4, i % 256, i % 256, i % 256),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Fake encoder
// ---------------------------------------------------------------------------

function createFakeEncoder(): Encoder {
  return {
    async encodeVideo(_frames: ExportFrame[]): Promise<Uint8Array> {
      // Return a small fake encoded buffer
      return new Uint8Array([0x00, 0x01, 0x02]);
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeService(overrides: Partial<ExportServiceOptions> = {}) {
  let counter = 0;
  const idGen = () => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return `${ts}${rand}` as never;
  };
  let now = new Date('2026-08-02T00:00:00Z');
  const clock = () => now;
  const jobs = new InMemoryJobRepository();
  const metrics = new ExportMetrics();
  const audit = new InMemoryExportAuditRecorder(clock);

  const svc = new ExportService({
    jobs,
    encoder: createFakeEncoder(),
    frameSource: createFakeFrameSource(),
    metrics,
    audit,
    idGenerator: idGen as () => never,
    clock,
    ...overrides,
  });

  return {
    svc,
    jobs,
    metrics,
    audit,
    tick: () => {
      now = new Date(now.getTime() + 1000);
    },
  };
}

const DEFAULT_INPUT: CreateExportJobInput = {
  tenantId: 'tenant-1',
  deckId: 'deck-1',
  format: 'gif',
  range: { start: 0, end: 9 },
  scale: 1,
  fps: 10,
};

describe('ExportService — job lifecycle', () => {
  it('createJob returns queued job', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    expect(job.status).toBe('queued');
    expect(job.tenantId).toBe('tenant-1');
    expect(job.format).toBe('gif');
  });

  it('renderJob transitions queued → rendering → encoding → ready', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    const result = await svc.renderJob(job);
    expect(result.status).toBe('ready');
    expect(result.artifactUri).toBeDefined();
  });

  it('cancelJob from queued → failed', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    const cancelled = await svc.cancelJob(job.id);
    expect(cancelled.status).toBe('failed');
    expect(cancelled.error?.code).toBe('CANCELLED');
  });

  it('cancelJob from ready throws InvalidJobTransitionError', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    await svc.renderJob(job);
    await expect(svc.cancelJob(job.id)).rejects.toBeInstanceOf(InvalidJobTransitionError);
  });

  it('cancelJob from failed throws InvalidJobTransitionError', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    await svc.cancelJob(job.id); // queued → failed
    await expect(svc.cancelJob(job.id)).rejects.toBeInstanceOf(InvalidJobTransitionError);
  });

  it('getJob returns existing job', async () => {
    const { svc } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    const found = await svc.getJob(job.id);
    expect(found.id).toBe(job.id);
  });

  it('getJob throws JobNotFoundError for unknown id', async () => {
    const { svc } = makeService();
    await expect(svc.getJob('nonexistent')).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it('listJobs returns jobs for tenant', async () => {
    const { svc } = makeService();
    await svc.createJob(DEFAULT_INPUT);
    await svc.createJob({ ...DEFAULT_INPUT, tenantId: 'tenant-2' });
    const jobs = await svc.listJobs('tenant-1');
    expect(jobs).toHaveLength(1);
  });
});

describe('ExportService — validation', () => {
  it('rejects invalid format', async () => {
    const { svc } = makeService();
    await expect(
      svc.createJob({ ...DEFAULT_INPUT, format: 'avi' as never }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects invalid fps (0)', async () => {
    const { svc } = makeService();
    await expect(svc.createJob({ ...DEFAULT_INPUT, fps: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects invalid fps (>120)', async () => {
    const { svc } = makeService();
    await expect(svc.createJob({ ...DEFAULT_INPUT, fps: 200 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects invalid scale (0)', async () => {
    const { svc } = makeService();
    await expect(svc.createJob({ ...DEFAULT_INPUT, scale: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects invalid range (start > end)', async () => {
    const { svc } = makeService();
    await expect(
      svc.createJob({ ...DEFAULT_INPUT, range: { start: 10, end: 5 } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ExportService — render with fake FrameSource', () => {
  it('saves artifact and records audit', async () => {
    const { svc, audit } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    await svc.renderJob(job);
    const events = await audit.listByTenant('tenant-1');
    const readyEvents = events.filter((e) => e.action === 'export.ready');
    expect(readyEvents.length).toBe(1);
  });

  it('records metrics on successful render', async () => {
    const { svc, metrics } = makeService();
    const job = await svc.createJob(DEFAULT_INPUT);
    await svc.renderJob(job);
    expect(metrics.jobsCreated).toBe(1);
    expect(metrics.jobsReady).toBe(1);
  });
});

describe('ExportService — encoder budget error', () => {
  it('marks job failed when encoder throws budget error', async () => {
    const failEncoder: Encoder = {
      async encodeVideo(_frames, options) {
        if (options.format === 'gif') {
          throw new ExportBudgetError('gif', 12, 15);
        }
        return new Uint8Array();
      },
    };
    const { svc } = makeService({ encoder: failEncoder });
    const job = await svc.createJob(DEFAULT_INPUT);
    const result = await svc.renderJob(job);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('EXPORT_BUDGET_EXCEEDED');
  });
});

describe('ExportService — unsupported encoder', () => {
  it('marks job failed when encoder returns unsupported', async () => {
    const unsupportedEncoder: Encoder = {
      async encodeVideo() {
        return { unsupported: true as const };
      },
    };
    const { svc } = makeService({ encoder: unsupportedEncoder });
    const job = await svc.createJob(DEFAULT_INPUT);
    const result = await svc.renderJob(job);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
  });
});
