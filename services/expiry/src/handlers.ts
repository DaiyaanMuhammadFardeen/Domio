/**
 * Expiry REST handlers (Phase 18).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST /v1/expiry-policies                 upsertPolicy
 *   GET  /v1/expiry-policies                 listPolicies
 *   POST /v1/expiry-dashboard/confirm-freshness  confirmFreshness
 *   GET  /v1/expiry-dashboard                getExpiryDashboard
 */

import type { ExpiryPolicyInput } from './types.js';
import type { ExpiryService } from './service.js';
import {
  ExpiryValidationError,
  PolicyNotFoundError,
  ResourceFlaggedError,
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

export interface ExpiryHandlerContext {
  readonly service: ExpiryService;
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
  if (e instanceof ExpiryValidationError) return badRequest(e.message, e.code);
  if (e instanceof PolicyNotFoundError) return notFound(e.message);
  if (e instanceof ResourceFlaggedError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/expiry-policies
// ---------------------------------------------------------------------------

export async function upsertPolicyHandler(
  req: HttpRequest<Record<string, never>, ExpiryPolicyInput>,
  ctx: ExpiryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const policy = await ctx.service.upsertPolicy(req.body, actorId);
    return created({ policy });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/expiry-policies
// ---------------------------------------------------------------------------

export async function listPoliciesHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: ExpiryHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    if (!workspaceId) {
      return badRequest('workspace_id is required', 'EXPIRY_VALIDATION_ERROR');
    }
    const policies = await ctx.service.listPolicies(workspaceId);
    return ok({ policies });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/expiry-dashboard/confirm-freshness
// ---------------------------------------------------------------------------

export async function confirmFreshnessHandler(
  req: HttpRequest<Record<string, never>, { resource_type: string; resource_id: string }>,
  ctx: ExpiryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { resolved } = await ctx.service.confirmFreshness(
      req.body.resource_type,
      req.body.resource_id,
      actorId,
    );
    return ok({ resolved });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/expiry-dashboard
// ---------------------------------------------------------------------------

export async function getExpiryDashboardHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: ExpiryHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    if (!workspaceId) {
      return badRequest('workspace_id is required', 'EXPIRY_VALIDATION_ERROR');
    }
    const dashboard = await ctx.service.getExpiryDashboard(workspaceId);
    return ok(dashboard);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  upsertPolicy: upsertPolicyHandler,
  listPolicies: listPoliciesHandler,
  confirmFreshness: confirmFreshnessHandler,
  getExpiryDashboard: getExpiryDashboardHandler,
} as const;
