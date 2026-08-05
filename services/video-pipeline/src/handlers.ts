/**
 * Video pipeline — framework-free HTTP handlers (Phase 11).
 *
 * Mirrors the export-pipeline handler pattern: transport-agnostic
 * functions that accept HttpRequest and return HttpResponse.
 *
 * Endpoints (per contracts/openapi/v1/video-jobs.yaml):
 *   POST   /v1/video_jobs          createJob   (202)
 *   GET    /v1/video_jobs          listJobs    (200)
 *   GET    /v1/video_jobs/:id      getJob      (200/404)
 *   DELETE /v1/video_jobs/:id      cancelJob   (204/409)
 */

import type {
  CreateVideoJobInput,
  Rendition,
  VideoJobPriority,
} from './types.js';
import {
  InvalidJobTransitionError,
  ValidationError,
} from './types.js';
import type { VideoJobStore } from './jobs.js';
import { buildJob, reduceTransition } from './jobs.js';
import type { TranscodeBackend } from './transcoder.js';

// ---------------------------------------------------------------------------
// HTTP types
// ---------------------------------------------------------------------------

export interface HttpRequest<P = Record<string, string>, B = unknown, Q = Record<string, string | undefined>> {
  readonly method: string;
  readonly path: string;
  readonly params: P;
  readonly body: B;
  readonly query: Q;
  readonly headers: Record<string, string | undefined>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface VideoPipelineContext {
  readonly store: VideoJobStore;
  readonly backend: TranscodeBackend;
  readonly defaultWorkspaceId?: string;
  readonly clock?: () => Date;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function accepted<T>(body: T): HttpResponse {
  return { status: 202, body };
}
function noContent(): HttpResponse {
  return { status: 204, body: null };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { code, message } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { code: 'NOT_FOUND', message } };
}
function conflict(message: string, code: string): HttpResponse {
  return { status: 409, body: { code, message } };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_RENDITIONS: readonly Rendition[] = ['240p', '480p', '720p', '1080p'];
const VALID_PRIORITIES: readonly VideoJobPriority[] = ['low', 'normal', 'high'];

function validateCreateInput(body: Record<string, unknown>): CreateVideoJobInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  const { videoAssetId, renditions, extractCaptions, extractWaveform, priority } = body as Record<string, unknown>;

  if (typeof videoAssetId !== 'string' || videoAssetId.length === 0) {
    throw new ValidationError('videoAssetId is required and must be a non-empty string');
  }

  if (!Array.isArray(renditions) || renditions.length === 0) {
    throw new ValidationError('renditions must be a non-empty array');
  }

  for (const r of renditions) {
    if (!VALID_RENDITIONS.includes(r as Rendition)) {
      throw new ValidationError(`Invalid rendition: ${String(r)}. Must be one of: ${VALID_RENDITIONS.join(', ')}`);
    }
  }

  if (extractCaptions !== undefined && typeof extractCaptions !== 'boolean') {
    throw new ValidationError('extractCaptions must be a boolean');
  }

  if (extractWaveform !== undefined && typeof extractWaveform !== 'boolean') {
    throw new ValidationError('extractWaveform must be a boolean');
  }

  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority as VideoJobPriority)) {
      throw new ValidationError(`Invalid priority: ${String(priority)}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
  }

  const input: CreateVideoJobInput = {
    videoAssetId,
    renditions: renditions as Rendition[],
  };
  if (extractCaptions !== undefined) {
    (input as { extractCaptions?: boolean }).extractCaptions = extractCaptions as boolean;
  }
  if (extractWaveform !== undefined) {
    (input as { extractWaveform?: boolean }).extractWaveform = extractWaveform as boolean;
  }
  if (priority !== undefined) {
    (input as { priority?: VideoJobPriority }).priority = priority as VideoJobPriority;
  }

  return input;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function createJobHandler(
  req: HttpRequest<Record<string, never>, unknown>,
  ctx: VideoPipelineContext,
): Promise<HttpResponse> {
  let input: CreateVideoJobInput;
  try {
    input = validateCreateInput(req.body as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, e.code);
    throw e;
  }

  const workspaceId = ctx.defaultWorkspaceId ?? input.videoAssetId;
  const clock = ctx.clock ?? (() => new Date());
  const { job } = buildJob(input, { workspaceId, clock });

  ctx.store.insert(job, workspaceId);

  // Attempt async transcode (fire-and-forget pattern for NoFfmpegBackend)
  try {
    ctx.store.update(job.id, { status: 'processing' });
    reduceTransition('queued', 'processing');

    const result = await ctx.backend.transcode(job);

    if ('unsupported' in result && result.unsupported) {
      // NoFfmpegBackend path — mark done with unsupported sentinel
      // (mirrors P09 `{ unsupported: true }` pattern)
      ctx.store.update(job.id, { status: 'ready' });
      reduceTransition('processing', 'ready');
    } else {
      // Real backend produced URLs — mark ready
      ctx.store.update(job.id, { status: 'ready' });
      reduceTransition('processing', 'ready');
    }
  } catch {
    ctx.store.update(job.id, {
      status: 'failed',
      errorMessage: 'Transcoding failed',
    });
  }

  return accepted(ctx.store.findById(job.id) ?? job);
}

export async function getJobHandler(
  req: HttpRequest<{ id: string }>,
  ctx: VideoPipelineContext,
): Promise<HttpResponse> {
  const job = ctx.store.findById(req.params.id);
  if (!job) return notFound(`Video job ${req.params.id} not found`);
  return ok(job);
}

export async function listJobsHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: VideoPipelineContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id ?? ctx.defaultWorkspaceId;
  if (!workspaceId) {
    return badRequest('workspace_id query parameter is required', 'VALIDATION_ERROR');
  }
  const jobs = ctx.store.listByWorkspace(workspaceId);
  return ok({ items: jobs });
}

export async function cancelJobHandler(
  req: HttpRequest<{ id: string }>,
  ctx: VideoPipelineContext,
): Promise<HttpResponse> {
  const job = ctx.store.findById(req.params.id);
  if (!job) return notFound(`Video job ${req.params.id} not found`);

  // Cannot cancel terminal states
  if (job.status === 'ready') {
    return conflict(
      `Cannot cancel job in status "${job.status}"`,
      'CANCEL_CONFLICT',
    );
  }
  if (job.status === 'failed') {
    return conflict(
      `Cannot cancel job in status "${job.status}"`,
      'CANCEL_CONFLICT',
    );
  }

  // queued or processing → failed with cancellation message
  try {
    reduceTransition(job.status, 'failed');
  } catch (e) {
    if (e instanceof InvalidJobTransitionError) {
      return conflict(e.message, e.code);
    }
    throw e;
  }

  ctx.store.update(job.id, {
    status: 'failed',
    errorMessage: 'Job was cancelled by user',
  });

  return noContent();
}

export const handlers = {
  createJob: createJobHandler,
  getJob: getJobHandler,
  listJobs: listJobsHandler,
  cancelJob: cancelJobHandler,
} as const;
