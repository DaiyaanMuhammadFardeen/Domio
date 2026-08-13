/**
 * Creator analytics REST handlers (Phase 19 Wave 3).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   getCreatorAnalytics
 *   listCreatorStatements
 *   getCreatorStatement
 *   generateCreatorStatement
 */

import type { StatementKind } from './types.js';
import type { CreatorAnalyticsService } from './service.js';
import {
  FeatureDisabledError,
  CreatorNotFoundError,
  StatementNotFoundError,
  InvalidPeriodError,
} from './types.js';
import { StoreNotConfiguredError } from './store/pg_store.js';

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

export interface CreatorAnalyticsHandlerContext {
  readonly service: CreatorAnalyticsService;
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
function problemDetail(title: string, status: number, detail: string, type?: string): HttpResponse {
  return {
    status,
    body: {
      type: type ?? 'about:blank',
      title,
      status,
      detail,
    },
  };
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
  if (e instanceof InvalidPeriodError) {
    return problemDetail('Invalid Period', 400, e.message);
  }
  if (e instanceof CreatorNotFoundError) {
    return problemDetail('Creator Not Found', 404, e.message);
  }
  if (e instanceof StatementNotFoundError) {
    return problemDetail('Statement Not Found', 404, e.message);
  }
  if (e instanceof FeatureDisabledError) {
    return problemDetail('Feature Disabled', 503, e.message);
  }
  if (e instanceof StoreNotConfiguredError) {
    return problemDetail('Store Not Configured', 503, e.message);
  }
  if (e instanceof Error && e.message.includes('not found')) {
    return problemDetail('Not Found', 404, e.message);
  }
  throw e;
}

// ---------------------------------------------------------------------------
// GET /v1/creator-analytics/{creator_id}/analytics
// ---------------------------------------------------------------------------

export async function getCreatorAnalyticsHandler(
  req: HttpRequest<{ creator_id: string }, undefined, { period?: string }>,
  ctx: CreatorAnalyticsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const creatorId = req.params.creator_id || actorId;
    const period = req.query.period ?? '';
    const analytics = await ctx.service.getCreatorAnalytics({
      creator_id: creatorId,
      period,
    });
    return ok({ analytics });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/creator-analytics/{creator_id}/statements
// ---------------------------------------------------------------------------

export async function listCreatorStatementsHandler(
  req: HttpRequest<{ creator_id: string }, undefined, { kind?: string }>,
  ctx: CreatorAnalyticsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const creatorId = req.params.creator_id || actorId;
    const opts: { creator_id: string; kind?: StatementKind } = { creator_id: creatorId };
    if (req.query.kind) opts.kind = req.query.kind as StatementKind;
    const statements = await ctx.service.listCreatorStatements(opts);
    return ok({ statements });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/creator-analytics/statements/{statement_id}
// ---------------------------------------------------------------------------

export async function getCreatorStatementHandler(
  req: HttpRequest<{ statement_id: string }>,
  ctx: CreatorAnalyticsHandlerContext,
): Promise<HttpResponse> {
  try {
    const statement = await ctx.service.getCreatorStatement(req.params.statement_id);
    return ok({ statement });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/creator-analytics/{creator_id}/statements/generate
// ---------------------------------------------------------------------------

export async function generateCreatorStatementHandler(
  req: HttpRequest<{ creator_id: string }, { period_month?: string }>,
  ctx: CreatorAnalyticsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const creatorId = req.params.creator_id || actorId;
    const periodMonth = req.body.period_month ?? '';

    const statement = await ctx.service.generateMonthlyStatement({
      creator_id: creatorId,
      period_month: periodMonth,
    });
    return created({ statement });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  getCreatorAnalytics: getCreatorAnalyticsHandler,
  listCreatorStatements: listCreatorStatementsHandler,
  getCreatorStatement: getCreatorStatementHandler,
  generateCreatorStatement: generateCreatorStatementHandler,
} as const;
