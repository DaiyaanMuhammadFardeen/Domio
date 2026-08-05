/**
 * @domio/cad-jobs — In-memory repository for CAD conversion jobs.
 *
 * Mirrors the cad_jobs table defined in
 * infrastructure/postgres/migrations/0037_phase11_embed_maps_jobs.up.sql.
 *
 * For the in-memory dev/test fallback the repository keeps:
 *   - An index by id for O(1) lookup.
 *   - An index by tenant_id for workspace-scoped list.
 */

import type {
  CadJob,
  CadProgress,
  CreateCadJobRequest,
} from './types.js';
import {
  DEFAULT_TESSELLATION_CHORD_MM,
  DEFAULT_TESSELLATION_ANGLE_DEG,
  DEFAULT_TARGET_POLY_COUNT,
} from './types.js';

export class CadJobNotFoundError extends Error {
  readonly code = 'CAD_JOB_NOT_FOUND' as const;
  constructor(public readonly jobId: string) {
    super(`CAD job ${jobId} not found`);
    this.name = 'CadJobNotFoundError';
  }
}

export class CadJobConflictError extends Error {
  readonly code = 'CAD_JOB_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CadJobConflictError';
  }
}

export interface CadJobPatch {
  progress?: CadProgress;
  resultUrl?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
}

export interface CadJobRepository {
  insert(record: CadJob): Promise<void>;
  findById(id: string): Promise<CadJob | null>;
  listByTenant(tenantId: string): Promise<CadJob[]>;
  update(id: string, patch: CadJobPatch): Promise<CadJob>;
  delete(id: string): Promise<boolean>;
}

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function defaultIdGenerator(): string {
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += ULID_CHARS[Math.floor(Math.random() * 32)]!;
  }
  return id;
}

export function buildWebsocketUrl(jobId: string): string {
  // Local dev default — replace at deploy time with the public origin.
  return `wss://api.domio.app/v1/cad_jobs/${jobId}/stream`;
}

export class InMemoryCadJobRepository implements CadJobRepository {
  private store = new Map<string, CadJob>();

  async insert(record: CadJob): Promise<void> {
    this.store.set(record.id, record);
  }

  async findById(id: string): Promise<CadJob | null> {
    return this.store.get(id) ?? null;
  }

  async listByTenant(tenantId: string): Promise<CadJob[]> {
    const items: CadJob[] = [];
    for (const job of this.store.values()) {
      if (job.tenantId === tenantId) {
        items.push(job);
      }
    }
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async update(id: string, patch: CadJobPatch): Promise<CadJob> {
    const existing = this.store.get(id);
    if (!existing) throw new CadJobNotFoundError(id);

    const updated: CadJob = { ...existing };
    if (patch.progress !== undefined) {
      (updated as { progress: CadProgress }).progress = patch.progress;
    }
    if (patch.resultUrl !== undefined) {
      (updated as { resultUrl: string | null }).resultUrl = patch.resultUrl;
    }
    if (patch.finishedAt !== undefined) {
      (updated as { finishedAt: string | null }).finishedAt = patch.finishedAt;
    }
    if (patch.errorMessage !== undefined) {
      (updated as { errorMessage: string | null }).errorMessage = patch.errorMessage;
    }
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

export interface CreateCadJobDeps {
  readonly idGenerator?: () => string;
  readonly websocketUrlBuilder?: (jobId: string) => string;
  readonly now?: () => Date;
}

/**
 * Construct a fresh CadJob from a validated create request.
 *
 * The job starts in `parsing` progress; the worker is responsible for
 * driving it forward through meshing → optimizing → done.
 */
export function buildCadJob(req: CreateCadJobRequest, deps: CreateCadJobDeps = {}): CadJob {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const wsBuilder = deps.websocketUrlBuilder ?? buildWebsocketUrl;
  const now = deps.now ?? (() => new Date());
  const id = idGenerator();
  const nowIso = now().toISOString();
  return {
    id,
    tenantId: req.tenantId,
    modelAssetId: req.modelAssetId,
    tessellationChordMm: req.tessellationChordMm ?? DEFAULT_TESSELLATION_CHORD_MM,
    tessellationAngleDeg: req.tessellationAngleDeg ?? DEFAULT_TESSELLATION_ANGLE_DEG,
    targetPolyCount: req.targetPolyCount ?? DEFAULT_TARGET_POLY_COUNT,
    format: req.format ?? 'glb',
    progress: 'parsing' satisfies CadProgress,
    websocketUrl: wsBuilder(id),
    resultUrl: null,
    errorMessage: null,
    createdAt: nowIso,
    finishedAt: null,
  };
}