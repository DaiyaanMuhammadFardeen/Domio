/**
 * Export pipeline — service layer (Phase 09).
 *
 * ExportService orchestrates the full export lifecycle:
 *   createJob → queued → rendering → encoding → ready
 *                                  ↘ failed (terminal)
 *
 * The service is transport-agnostic; REST handlers wrap it.
 */

import type { ULID } from '@domio/schema';

import type {
  CreateExportJobInput,
  Encoder,
  ExportFrame,
  ExportFormat,
  ExportJob,
  ExportJobStatus,
  ExportJobError,
  FrameSource,
} from './types.js';
import {
  ExportBudgetError,
  InvalidJobTransitionError,
  JobNotFoundError,
  ValidationError,
  isValidTransition,
} from './types.js';
import type { ExportMetrics } from './metrics.js';
import type { ExportAuditRecorder } from './audit.js';
import { validateUrl, SsrfBlockError } from './ssrf.js';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ExportJobRepository {
  insert(job: ExportJob): Promise<void>;
  findById(id: string): Promise<ExportJob | null>;
  listByTenant(tenantId: string): Promise<ExportJob[]>;
  update(id: string, patch: Partial<ExportJob>): Promise<ExportJob>;
}

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface ExportServiceOptions {
  readonly jobs: ExportJobRepository;
  readonly encoder: Encoder;
  readonly frameSource: FrameSource;
  readonly metrics?: ExportMetrics;
  readonly audit?: ExportAuditRecorder;
  /** Caller-provided ULID generator (deterministic in tests). */
  readonly idGenerator?: () => ULID;
  /** Caller-provided clock (deterministic in tests). */
  readonly clock?: () => Date;
  /** Artifact storage callback — save encoded bytes and return a URI. */
  readonly saveArtifact?: (jobId: string, data: Uint8Array, format: ExportFormat) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExportService {
  private readonly jobs: ExportJobRepository;
  private readonly encoder: Encoder;
  private readonly frameSource: FrameSource;
  private readonly metrics: ExportMetrics | undefined;
  private readonly audit: ExportAuditRecorder | undefined;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;
  private readonly saveArtifact: (jobId: string, data: Uint8Array, format: ExportFormat) => Promise<string>;

  constructor(opts: ExportServiceOptions) {
    this.jobs = opts.jobs;
    this.encoder = opts.encoder;
    this.frameSource = opts.frameSource;
    this.metrics = opts.metrics;
    this.audit = opts.audit;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
    this.saveArtifact = opts.saveArtifact ?? defaultSaveArtifact;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async createJob(input: CreateExportJobInput): Promise<ExportJob> {
    this.validateInput(input);
    const id = this.idGen();
    const now = this.clock();
    const job: ExportJob = {
      id,
      tenantId: input.tenantId,
      deckId: input.deckId,
      format: input.format,
      range: input.range,
      scale: input.scale,
      fps: input.fps,
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    await this.jobs.insert(job);
    this.metrics?.recordJobCreated();
    return job;
  }

  async getJob(id: string): Promise<ExportJob> {
    const job = await this.jobs.findById(id);
    if (!job) throw new JobNotFoundError(id);
    return job;
  }

  async listJobs(tenantId: string): Promise<ExportJob[]> {
    return this.jobs.listByTenant(tenantId);
  }

  async cancelJob(id: string): Promise<ExportJob> {
    const job = await this.getJob(id);
    if (job.status === 'ready') {
      throw new InvalidJobTransitionError(job.status, 'failed');
    }
    if (job.status === 'failed') {
      throw new InvalidJobTransitionError(job.status, 'failed');
    }
    // queued or rendering → failed with 'cancelled'
    const updated = await this.jobs.update(id, {
      status: 'failed',
      error: { code: 'CANCELLED', message: 'Job was cancelled by user' },
      updatedAt: this.clock(),
    });
    this.metrics?.recordJobFailed();
    return updated;
  }

  // -------------------------------------------------------------------------
  // Render orchestration
  // -------------------------------------------------------------------------

  async renderJob(job: ExportJob): Promise<ExportJob> {
    // Transition to rendering
    this.ensureValidTransition(job.status, 'rendering');
    let current = await this.jobs.update(job.id, {
      status: 'rendering',
      updatedAt: this.clock(),
    });

    try {
      // SSRF guard on source URL if provided
      if (current.sourceUrl) {
        try {
          validateUrl(current.sourceUrl);
        } catch (e) {
          if (e instanceof SsrfBlockError) {
            this.metrics?.recordSsrfBlock();
            return this.failJob(current, { code: 'SSRF_BLOCKED', message: e.message });
          }
          throw e;
        }
      }

      // Resolve frames via injectable FrameSource
      const frames: ExportFrame[] = await this.frameSource.resolveFrames(
        current.deckId,
        current.range,
        current.scale,
      );

      // Transition to encoding
      this.ensureValidTransition(current.status, 'encoding');
      current = await this.jobs.update(current.id, {
        status: 'encoding',
        updatedAt: this.clock(),
      });

      // Encode
      const encoded = await this.encoder.encodeVideo(frames, {
        format: current.format,
        fps: current.fps,
      });

      if ('unsupported' in encoded && encoded.unsupported) {
        return this.failJob(current, {
          code: 'UNSUPPORTED_FORMAT',
          message: `Encoder not available for ${current.format}`,
        });
      }

      // Save artifact
      const artifactUri = await this.saveArtifact(
        current.id,
        encoded as Uint8Array,
        current.format,
      );

      // Transition to ready
      this.ensureValidTransition(current.status, 'ready');
      current = await this.jobs.update(current.id, {
        status: 'ready',
        artifactUri,
        updatedAt: this.clock(),
      });

      this.metrics?.recordJobReady();

      // Audit
      await this.audit?.record({
        tenantId: current.tenantId,
        actorId: 'system',
        action: 'export.ready',
        payload: { jobId: current.id, format: current.format, artifactUri },
      });

      return current;
    } catch (e) {
      // Handle known errors
      if (e instanceof ExportBudgetError) {
        return this.failJob(current, { code: e.code, message: e.message });
      }
      if (e instanceof SsrfBlockError) {
        this.metrics?.recordSsrfBlock();
        return this.failJob(current, { code: 'SSRF_BLOCKED', message: e.message });
      }
      // Unknown error — record and rethrow
      this.metrics?.recordEncodeError();
      return this.failJob(current, {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private validateInput(input: CreateExportJobInput): void {
    const validFormats: ExportFormat[] = ['gif', 'mp4', 'webm'];
    if (!validFormats.includes(input.format)) {
      throw new ValidationError(`Invalid format: ${input.format}`);
    }
    if (input.fps <= 0 || input.fps > 120) {
      throw new ValidationError(`Invalid fps: ${input.fps}`);
    }
    if (input.scale <= 0 || input.scale > 10) {
      throw new ValidationError(`Invalid scale: ${input.scale}`);
    }
    if (input.range.start < 0 || input.range.end < input.range.start) {
      throw new ValidationError(`Invalid range: start=${input.range.start}, end=${input.range.end}`);
    }
  }

  private ensureValidTransition(from: ExportJobStatus, to: ExportJobStatus): void {
    if (!isValidTransition(from, to)) {
      throw new InvalidJobTransitionError(from, to);
    }
  }

  private async failJob(job: ExportJob, error: ExportJobError): Promise<ExportJob> {
    const updated = await this.jobs.update(job.id, {
      status: 'failed',
      error,
      updatedAt: this.clock(),
    });
    this.metrics?.recordJobFailed();
    await this.audit?.record({
      tenantId: updated.tenantId,
      actorId: 'system',
      action: 'export.failed',
      payload: { jobId: updated.id, error },
    });
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultId: () => ULID = () =>
  `01H000000000000000000000${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}` as ULID;

const defaultClock = () => new Date();

async function defaultSaveArtifact(_jobId: string, _data: Uint8Array, format: ExportFormat): Promise<string> {
  // Stub: return a fake artifact URI
  return `artifact://exports/${_jobId}.${format}`;
}
