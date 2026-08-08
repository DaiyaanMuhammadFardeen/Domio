/**
 * @domio/permission-engine — HTTP handlers (framework-free).
 *
 * Three routes:
 *   POST /v1/permissions/grants  — createGrant   (201)
 *   GET  /v1/permissions/grants  — listGrants     (200)
 *   POST /v1/permissions/check   — checkPermission (200)
 *
 * Actor identity is extracted from `x-actor-id` header or `actorId` query param.
 * The check endpoint always returns 200 with `{ allowed: false }` when denied
 * (the caller is responsible for returning 403).
 */

import type { ResourceType, PermissionGrantInput, PermissionRequest } from './types.js';
import { ValidationError } from './types.js';
import type { PermissionService } from './service.js';

// ---------------------------------------------------------------------------
// HTTP types
// ---------------------------------------------------------------------------

export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly query?: Record<string, string | undefined>;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

export interface PermissionHandlerContext {
  readonly service: PermissionService;
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

// ---------------------------------------------------------------------------
// Actor extraction
// ---------------------------------------------------------------------------

function extractActorId(req: HttpRequest): string | undefined {
  return req.headers?.['x-actor-id'] ?? req.query?.['actorId'];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /v1/permissions/grants
 *
 * Create a new permission grant.  Actor is taken from x-actor-id header
 * or actorId query param (used as `createdBy`).
 */
export async function createGrantHandler(
  req: HttpRequest,
  ctx: PermissionHandlerContext,
): Promise<HttpResponse> {
  const actorId = extractActorId(req);
  if (!actorId) {
    return badRequest('x-actor-id header or actorId query param is required', 'ACTOR_REQUIRED');
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    return badRequest('request body is required', 'BODY_REQUIRED');
  }

  try {
    const input: PermissionGrantInput = {
      resourceType: body['resourceType'] as ResourceType,
      resourceId: body['resourceId'] as string,
      principalId: body['principalId'] as string,
      principalType: body['principalType'] as 'user' | 'group',
      capabilities: body['capabilities'] as string[],
      createdBy: actorId,
    };

    if (body['isDeny'] !== undefined) {
      (input as { isDeny: boolean }).isDeny = body['isDeny'] as boolean;
    }
    if (body['effectiveFrom'] !== undefined) {
      (input as { effectiveFrom: Date }).effectiveFrom = new Date(body['effectiveFrom'] as string);
    }
    if (body['effectiveTo'] !== undefined) {
      (input as { effectiveTo: Date | null }).effectiveTo = new Date(body['effectiveTo'] as string);
    }

    const grant = await ctx.service.createGrant(input);
    return created(grant);
  } catch (e) {
    if (e instanceof ValidationError) {
      return badRequest(e.message, e.code);
    }
    throw e;
  }
}

/**
 * GET /v1/permissions/grants
 *
 * List all grants for a given resource.  Query params: resource_type, resource_id.
 */
export async function listGrantsHandler(
  req: HttpRequest,
  ctx: PermissionHandlerContext,
): Promise<HttpResponse> {
  const resourceType = req.query?.['resource_type'] as ResourceType | undefined;
  const resourceId = req.query?.['resource_id'];

  if (!resourceType || !resourceId) {
    return badRequest('resource_type and resource_id query params are required', 'QUERY_REQUIRED');
  }

  const grants = await ctx.service.listGrants(resourceType, resourceId);
  return ok(grants);
}

/**
 * POST /v1/permissions/check
 *
 * Evaluate a permission.  Always returns 200 with `{ allowed: boolean, ... }`.
 * The caller is responsible for returning 403 when `allowed` is false.
 * Accepts optional `at` for point-in-time (historical) checks.
 */
export async function checkPermissionHandler(
  req: HttpRequest,
  ctx: PermissionHandlerContext,
): Promise<HttpResponse> {
  const actorId = extractActorId(req);
  if (!actorId) {
    return badRequest('x-actor-id header or actorId query param is required', 'ACTOR_REQUIRED');
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    return badRequest('request body is required', 'BODY_REQUIRED');
  }

  try {
    const permissionRequest: PermissionRequest = {
      principalId: (body['principalId'] as string) ?? actorId,
      resourceType: body['resourceType'] as ResourceType,
      resourceId: body['resourceId'] as string,
      capability: body['capability'] as string,
    };

    if (body['at'] !== undefined) {
      (permissionRequest as { at: Date }).at = new Date(body['at'] as string);
    }

    const evaluation = await ctx.service.checkPermission(permissionRequest);
    return ok(evaluation);
  } catch (e) {
    if (e instanceof ValidationError) {
      return badRequest(e.message, e.code);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  createGrant: createGrantHandler,
  listGrants: listGrantsHandler,
  checkPermission: checkPermissionHandler,
} as const;
