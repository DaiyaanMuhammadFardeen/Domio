/**
 * Lint service — REST handlers.
 *
 * Endpoints:
 *
 *   POST /v1/lint/run    runLint
 *   GET  /v1/lint/runs   listByDeck (?deckId=)
 *   GET  /v1/lint/runs/latest getLatest (?deckId=)
 *   GET  /v1/lint/runs/:runId  getRun
 */

import {
  type LintService,
  type LintRunRequest,
  LintValidationError,
  type LintFinding,
  type LintSeverity,
} from './service.js';
import type { LintMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';

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

export interface LintHandlerContext {
  readonly service: LintService;
  readonly metrics?: LintMetrics;
  readonly audit?: AuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: { actorId: string | undefined; action: 'read' | 'write' }) => void;
}

function ok<T>(b: T): HttpResponse {
  return { status: 200, body: b };
}
function badRequest(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 400, body: { error: message, code, ...(extra ?? {}) } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}

export async function runLintHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<LintRunRequest, 'orgId' | 'actorId'> & { actorId?: string }
  >,
  ctx: LintHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  const { actorId: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const result = await ctx.service.runLint({ ...rest, orgId: req.params.orgId, actorId });
    ctx.metrics?.recordRun(result.findings.length, result.latencyMs);
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'lint.run',
      payload: {
        runId: result.runId,
        blockCount: result.blockCount,
        warnCount: result.warnCount,
        infoCount: result.infoCount,
        elementsScanned: result.elementsScanned,
      },
    });
    return ok(result);
  } catch (e) {
    if (e instanceof LintValidationError)
      return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function listByDeckHandler(
  req: HttpRequest<{ orgId: string }, undefined, { deckId?: string }>,
  ctx: LintHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  if (!req.query.deckId) return badRequest('deckId is required', 'DECK_ID_REQUIRED');
  const runs = await ctx.service.listByDeck(req.query.deckId, req.params.orgId);
  return ok({ runs });
}

export async function getLatestHandler(
  req: HttpRequest<{ orgId: string }, undefined, { deckId?: string }>,
  ctx: LintHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  if (!req.query.deckId) return badRequest('deckId is required', 'DECK_ID_REQUIRED');
  const run = await ctx.service.latestForDeck(req.query.deckId, req.params.orgId);
  return ok({ run });
}

export async function getRunHandler(
  req: HttpRequest<{ orgId: string; runId: string }, undefined>,
  ctx: LintHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const run = await ctx.service.getRun(req.params.runId, req.params.orgId);
  return ok({ run });
}

export const handlers = {
  runLint: runLintHandler,
  listByDeck: listByDeckHandler,
  getLatest: getLatestHandler,
  getRun: getRunHandler,
} as const;

export type { LintFinding, LintSeverity };
