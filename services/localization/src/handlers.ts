/**
 * Localization service — REST handlers.
 *
 * Endpoints:
 *
 *   POST /v1/localization/format    — formatNumber
 *   POST /v1/localization/rates     — ingestRates
 *   POST /v1/localization/convert   — convert
 */

import {
  InvalidLocaleError,
  InvalidCurrencyError,
  MissingRateError,
} from './service.js';
import type {
  LocalizationService,
  FormatInput,
  ConvertInput,
} from './service.js';
import type { LocalizationMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';
import type { RateSnapshot } from './rates.js';

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

export interface LocalizationHandlerContext {
  readonly service: LocalizationService;
  readonly metrics?: LocalizationMetrics;
  readonly audit?: AuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: { actorId: string | undefined; action: 'read' | 'write' }) => void;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function formatHandler(
  req: HttpRequest<unknown, FormatInput>,
  ctx: LocalizationHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const result = ctx.service.formatNumber(req.body);
    ctx.metrics?.recordFormat();
    ctx.audit?.record({
      tenantId: 'default',
      actorId: actorId ?? 'system',
      action: 'localization.format',
      payload: { locale: req.body.locale, style: req.body.style },
    });
    return ok({ formatted: result });
  } catch (e) {
    if (e instanceof InvalidLocaleError) return badRequest(e.message, e.code);
    if (e instanceof InvalidCurrencyError) return badRequest(e.message, e.code);
    throw e;
  }
}

export async function ratesHandler(
  req: HttpRequest<unknown, { pairs: readonly RateSnapshot[] }, { actorId?: string }>,
  ctx: LocalizationHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  await ctx.service.ingestRates(req.body.pairs);
  ctx.metrics?.recordRateIngest();
  ctx.audit?.record({
    tenantId: 'default',
    actorId,
    action: 'localization.rates.ingest',
    payload: { count: req.body.pairs.length },
  });
  return ok({ ingested: req.body.pairs.length });
}

export async function convertHandler(
  req: HttpRequest<unknown, ConvertInput>,
  ctx: LocalizationHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const result = await ctx.service.convert(req.body);
    ctx.metrics?.recordConversion();
    ctx.audit?.record({
      tenantId: 'default',
      actorId: actorId ?? 'system',
      action: 'localization.convert',
      payload: { from: req.body.from, to: req.body.to },
    });
    return ok(result);
  } catch (e) {
    if (e instanceof MissingRateError) return notFound(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  format: formatHandler,
  rates: ratesHandler,
  convert: convertHandler,
} as const;
