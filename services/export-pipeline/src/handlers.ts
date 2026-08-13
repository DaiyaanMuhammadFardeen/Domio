/**
 * Export pipeline — REST handlers (Phase 09).
 *
 * Web-framework-free handler functions that the Hono / Express /
 * Node http server can mount.  Mirrors the theme service handlers pattern.
 *
 * Endpoints:
 *
 *   POST   /v1/export/jobs         createJob   (201)
 *   GET    /v1/export/jobs/:id     getJob      (200/404)
 *   GET    /v1/export/jobs         listJobs    (200)
 *   DELETE /v1/export/jobs/:id     cancelJob   (204)
 */

import type { ExportService } from './service.js';
import type { ExportMetrics } from './metrics.js';
import type { ExportAuditRecorder } from './audit.js';
import type { CreateExportJobInput } from './types.js';
import { InvalidJobTransitionError, JobNotFoundError, ValidationError } from './types.js';

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

export interface ExportHandlerContext {
  readonly service: ExportService;
  readonly metrics?: ExportMetrics;
  readonly audit?: ExportAuditRecorder;
  /** Resolve actor from auth context. */
  resolveActorId?: (req: HttpRequest) => string | undefined;
  /** ACL guard. */
  authorize?: (args: { actorId: string | undefined; action: 'read' | 'write' }) => void;
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
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
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

export async function createJobHandler(
  req: HttpRequest<
    Record<string, never>,
    CreateExportJobInput & { actorId?: string },
    Record<string, string | undefined>
  >,
  ctx: ExportHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });

  const { actorId: _ignored, ...input } = req.body;
  void _ignored;

  try {
    const job = await ctx.service.createJob(input as CreateExportJobInput);
    ctx.audit?.record({
      tenantId: input.tenantId,
      actorId,
      action: 'export.create',
      payload: { jobId: job.id, format: job.format, deckId: job.deckId },
    });
    return created(job);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, e.code);
    throw e;
  }
}

export async function getJobHandler(
  req: HttpRequest<{ id: string }, undefined, { actorId?: string }>,
  ctx: ExportHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });

  try {
    const job = await ctx.service.getJob(req.params.id);
    return ok(job);
  } catch (e) {
    if (e instanceof JobNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function listJobsHandler(
  req: HttpRequest<Record<string, never>, undefined, { tenantId?: string; actorId?: string }>,
  ctx: ExportHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });

  const tenantId = req.query.tenantId;
  if (!tenantId) return badRequest('tenantId query param is required', 'TENANT_ID_REQUIRED');

  const jobs = await ctx.service.listJobs(tenantId);
  return ok({ jobs });
}

export async function cancelJobHandler(
  req: HttpRequest<{ id: string }, undefined, { actorId?: string }>,
  ctx: ExportHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });

  try {
    const job = await ctx.service.cancelJob(req.params.id);
    ctx.audit?.record({
      tenantId: job.tenantId,
      actorId,
      action: 'export.cancel',
      payload: { jobId: job.id },
    });
    return noContent();
  } catch (e) {
    if (e instanceof JobNotFoundError) return notFound(e.message);
    if (e instanceof InvalidJobTransitionError) return conflict(e.message, e.code);
    throw e;
  }
}

export const handlers = {
  createJob: createJobHandler,
  getJob: getJobHandler,
  listJobs: listJobsHandler,
  cancelJob: cancelJobHandler,
} as const;
