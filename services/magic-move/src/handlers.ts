/**
 * Magic Move — REST handlers (Phase 09).
 *
 * Web-framework-free handler functions for the magic-move API.
 * Validates request bodies, delegates to the service, and maps
 * domain errors to HTTP status codes.
 *
 * Endpoints:
 *
 *   GET    /v1/magic-move/jobs
 *   POST   /v1/magic-move/jobs
 *   GET    /v1/magic-move/jobs/:id
 *   DELETE /v1/magic-move/jobs/:id
 */

import type { MagicMoveService } from './service.js';
import {
  MagicMoveJobNotFoundError,
  JobNotCancellableError,
} from './dal.js';

// ---------------------------------------------------------------------------
// HTTP types
// ---------------------------------------------------------------------------

export interface HttpRequest<P = unknown, B = unknown, Q = Record<string, string | undefined>> {
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

export interface MagicMoveHandlerContext {
  readonly service: MagicMoveService;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function created<T>(body: T): HttpResponse {
  return { status: 201, body };
}
function noContent(): HttpResponse {
  return { status: 204, body: null };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function conflict(message: string, code: string): HttpResponse {
  return { status: 409, body: { error: message, code } };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listJobsHandler(
  req: HttpRequest<undefined, undefined, { tenant_id?: string; status?: string; limit?: string }>,
  ctx: MagicMoveHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('Missing tenant_id', 'VALIDATION_ERROR');

  const filters: { status?: 'pending' | 'computing' | 'done' | 'failed'; limit?: number } = {};
  if (req.query.status) {
    filters.status = req.query.status as 'pending' | 'computing' | 'done' | 'failed';
  }
  if (req.query.limit) {
    filters.limit = parseInt(req.query.limit, 10);
  }

  const jobs = await ctx.service.listJobs(tenantId, filters);
  return ok({ jobs });
}

export async function createJobHandler(
  req: HttpRequest<undefined, Record<string, unknown>, { tenant_id?: string }>,
  ctx: MagicMoveHandlerContext,
): Promise<HttpResponse> {
  const body = req.body as Record<string, unknown>;
  const tenantId = (body.tenantId as string | undefined) ?? req.query.tenant_id;
  if (!tenantId) return badRequest('Missing tenantId', 'VALIDATION_ERROR');

  const deckId = body.deckId as string | undefined;
  const fromSlideId = body.fromSlideId as string | undefined;
  const toSlideId = body.toSlideId as string | undefined;

  if (!deckId || !fromSlideId || !toSlideId) {
    return badRequest('Missing required fields: tenantId, deckId, fromSlideId, toSlideId', 'VALIDATION_ERROR');
  }

  const job = await ctx.service.createJob({ tenantId, deckId, fromSlideId, toSlideId });
  return created(job);
}

export async function getJobHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: MagicMoveHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('Missing tenant_id', 'VALIDATION_ERROR');

  try {
    const job = await ctx.service.getJob(req.params.id, tenantId);
    return ok(job);
  } catch (e) {
    if (e instanceof MagicMoveJobNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function cancelJobHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: MagicMoveHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('Missing tenant_id', 'VALIDATION_ERROR');

  try {
    await ctx.service.cancelJob(req.params.id, tenantId);
    return noContent();
  } catch (e) {
    if (e instanceof MagicMoveJobNotFoundError) return notFound(e.message);
    if (e instanceof JobNotCancellableError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  listJobs: listJobsHandler,
  createJob: createJobHandler,
  getJob: getJobHandler,
  cancelJob: cancelJobHandler,
} as const;
