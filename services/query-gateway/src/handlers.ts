/**
 * Query gateway — REST handlers (Phase 08 M2).
 *
 * Web-framework-free handler functions for the 5 routes:
 *   POST /v1/queries/execute    — executeQuery
 *   POST /v1/queries/webhook    — processWebhook
 *   POST /v1/queries/invalidate — invalidateQuery
 *   POST /v1/viewer-tokens      — issueViewerToken
 *   GET  /v1/queries/:id        — getQuery
 */

import type { QueryGatewayService } from './service.js';
import {
  QueryNotFoundError,
  RateLimitExceededError,
  ACLDeniedError,
  WebhookHMACError,
} from './service.js';
import type { QueryGatewayMetrics } from './metrics.js';
import type { QueryGatewayAuditRecorder } from './audit.js';

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

export interface QueryGatewayHandlerContext {
  readonly service: QueryGatewayService;
  readonly metrics?: QueryGatewayMetrics;
  readonly audit?: QueryGatewayAuditRecorder;
  /** Actor ID extraction from request; usually from the auth header. */
  resolveActorId?: (req: HttpRequest) => string | undefined;
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
function tooManyRequests(retryAfterMs: number): HttpResponse {
  return {
    status: 429,
    body: { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED', retryAfterMs },
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /v1/queries/execute
 *
 * Execute a live-data query. Returns the dataset snapshot and freshness record.
 */
export async function executeQueryHandler(
  req: HttpRequest<
    { orgId: string },
    { queryId: string; forceRefresh?: boolean },
    { actorId?: string }
  >,
  ctx: QueryGatewayHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  try {
    const result = await ctx.service.executeQuery(
      req.body.queryId,
      req.params.orgId,
      actorId,
      req.body.forceRefresh === true ? { forceRefresh: true } : {},
    );
    ctx.metrics?.recordExecution(0);
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'query.execute',
      payload: {
        queryId: req.body.queryId,
        fromCache: result.fromCache,
        cacheTier: result.cacheTier,
      },
    });
    return ok({
      snapshot: result.snapshot,
      freshness: result.freshness,
      fromCache: result.fromCache,
      cacheTier: result.cacheTier,
    });
  } catch (e) {
    if (e instanceof ACLDeniedError) return unauthorized();
    if (e instanceof RateLimitExceededError) {
      ctx.metrics?.recordRateLimitBlock();
      return tooManyRequests(e.retryAfterMs);
    }
    if (e instanceof QueryNotFoundError) return notFound(e.message);
    throw e;
  }
}

/**
 * POST /v1/queries/webhook
 *
 * Receive a webhook callback with dataset updates.
 */
export async function processWebhookHandler(
  req: HttpRequest<
    { orgId: string },
    { payload: string; signature: string; idempotencyKey: string; queryId: string },
    { actorId?: string }
  >,
  ctx: QueryGatewayHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  try {
    const result = await ctx.service.processWebhook(
      req.body.payload,
      req.body.signature,
      req.body.idempotencyKey,
      req.params.orgId,
      req.body.queryId,
      actorId,
    );
    if (result.deduped) {
      ctx.metrics?.recordWebhookDeduped();
    } else {
      ctx.metrics?.recordWebhookProcessed();
    }
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'query.webhook',
      payload: { queryId: req.body.queryId, deduped: result.deduped },
    });
    return ok({ snapshot: result.snapshot, deduped: result.deduped });
  } catch (e) {
    if (e instanceof ACLDeniedError) return unauthorized();
    if (e instanceof WebhookHMACError) return badRequest(e.message, e.code);
    if (e instanceof QueryNotFoundError) return notFound(e.message);
    throw e;
  }
}

/**
 * POST /v1/queries/invalidate
 *
 * Invalidate cached results for a query.
 */
export async function invalidateQueryHandler(
  req: HttpRequest<{ orgId: string }, { queryId: string }, { actorId?: string }>,
  ctx: QueryGatewayHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  try {
    await ctx.service.invalidateQuery(req.body.queryId, req.params.orgId, actorId);
    ctx.metrics?.recordInvalidation();
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'query.invalidate',
      payload: { queryId: req.body.queryId },
    });
    return noContent();
  } catch (e) {
    if (e instanceof ACLDeniedError) return unauthorized();
    if (e instanceof QueryNotFoundError) return notFound(e.message);
    throw e;
  }
}

/**
 * POST /v1/viewer-tokens
 *
 * Issue a viewer token for accessing query data.
 */
export async function issueViewerTokenHandler(
  req: HttpRequest<
    { orgId: string },
    { queryId: string; scopes?: string[]; ttlMs?: number },
    { actorId?: string }
  >,
  ctx: QueryGatewayHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  try {
    const token = await ctx.service.issueViewerToken(
      req.body.queryId,
      req.params.orgId,
      actorId,
      req.body.scopes ?? [],
      req.body.ttlMs ?? 3_600_000, // 1 hour default
    );
    ctx.metrics?.recordViewerTokenIssued();
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'viewer-token.issue',
      payload: { queryId: req.body.queryId, scopes: req.body.scopes },
    });
    return created(token);
  } catch (e) {
    if (e instanceof ACLDeniedError) return unauthorized();
    if (e instanceof QueryNotFoundError) return notFound(e.message);
    throw e;
  }
}

/**
 * GET /v1/queries/:id
 *
 * Get query status and latest snapshot.
 */
export async function getQueryHandler(
  req: HttpRequest<{ orgId: string; queryId: string }, undefined, { actorId?: string }>,
  ctx: QueryGatewayHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  try {
    const status = await ctx.service.getQueryStatus(req.params.queryId, req.params.orgId);
    return ok(status);
  } catch (e) {
    if (e instanceof ACLDeniedError) return unauthorized();
    if (e instanceof QueryNotFoundError) return notFound(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  executeQuery: executeQueryHandler,
  processWebhook: processWebhookHandler,
  invalidateQuery: invalidateQueryHandler,
  issueViewerToken: issueViewerTokenHandler,
  getQuery: getQueryHandler,
} as const;
