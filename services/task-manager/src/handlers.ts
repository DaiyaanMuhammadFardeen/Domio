/**
 * Task-manager REST handlers (Phase 18 #191).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST   /v1/task-links              createTaskLink
 *   GET    /v1/task-links              listTaskLinks
 *   PATCH  /v1/task-links/{id}         updateTaskLink
 *   DELETE /v1/task-links/{id}         deleteTaskLink
 *   POST   /v1/task-links/{id}/sync    syncTaskLink
 */

import type { TaskVendor, SyncMode, FieldMap } from './types.js';
import type { TaskManagerService } from './service.js';
import {
  TaskLinkNotFoundError,
  DuplicateTaskLinkError,
  SyncConflictError,
  ValidationError,
  FeatureDisabledError,
} from './types.js';
import { StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';

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

export interface TaskManagerHandlerContext {
  readonly service: TaskManagerService;
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
  return { status: 204, body: undefined };
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
function serviceUnavailable(message: string, code: string): HttpResponse {
  return { status: 503, body: { error: message, code } };
}

// ---------------------------------------------------------------------------
// Actor helper
// ---------------------------------------------------------------------------

function getActorId(req: HttpRequest): string {
  return (
    req.headers['x-actor-id'] ?? (req.query as Record<string, string | undefined>).actorId ?? ''
  );
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(e: unknown): HttpResponse {
  if (e instanceof ValidationError) return badRequest(e.message, e.code);
  if (e instanceof DuplicateTaskLinkError) return conflict(e.message, e.code);
  if (e instanceof SyncConflictError) return conflict(e.message, e.code);
  if (e instanceof TaskLinkNotFoundError) return notFound(e.message);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/task-links
// ---------------------------------------------------------------------------

export async function createTaskLinkHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      workspace_id: string;
      assignment_id: string;
      vendor: TaskVendor;
      external_task_id: string;
      external_project_id: string;
      field_map?: FieldMap;
      sync_mode?: SyncMode;
    }
  >,
  ctx: TaskManagerHandlerContext,
): Promise<HttpResponse> {
  try {
    const link = await ctx.service.createLink(req.body);
    return created({ link });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/task-links
// ---------------------------------------------------------------------------

export async function listTaskLinksHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: TaskManagerHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    const links = await ctx.service.listLinks(workspaceId);
    return ok({ links });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/task-links/{id}
// ---------------------------------------------------------------------------

export async function updateTaskLinkHandler(
  req: HttpRequest<
    { id: string },
    {
      field_map?: FieldMap;
      sync_mode?: SyncMode;
    }
  >,
  ctx: TaskManagerHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const link = await ctx.service.updateLink(req.params.id, req.body, actorId);
    return ok({ link });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/task-links/{id}
// ---------------------------------------------------------------------------

export async function deleteTaskLinkHandler(
  req: HttpRequest<{ id: string }>,
  ctx: TaskManagerHandlerContext,
): Promise<HttpResponse> {
  try {
    await ctx.service.deleteLink(req.params.id);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/task-links/{id}/sync
// ---------------------------------------------------------------------------

export async function syncTaskLinkHandler(
  req: HttpRequest<{ id: string }, { direction?: 'domio_to_task' | 'task_to_domio' }>,
  ctx: TaskManagerHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const direction = req.body.direction ?? 'domio_to_task';
    const result = await ctx.service.syncLink(req.params.id, direction, actorId);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createTaskLink: createTaskLinkHandler,
  listTaskLinks: listTaskLinksHandler,
  updateTaskLink: updateTaskLinkHandler,
  deleteTaskLink: deleteTaskLinkHandler,
  syncTaskLink: syncTaskLinkHandler,
} as const;
