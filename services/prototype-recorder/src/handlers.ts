/**
 * Prototype-recorder service — REST handlers (web-framework-free).
 *
 * Same handler pattern as `services/prototype-runtime/src/handlers.ts`
 * and `services/timeline-api/src/handlers.ts`.
 */

import {
  NotFoundError,
  HmacVerificationError,
  ReorderDetectedError,
  ValidationError,
  RegionMismatchError,
  HmacKeyGenerationError,
} from './dal.js';
import type { PrototypeRecorderService } from './service.js';
import { validateStartSession, validateIngestBatch, validateRotateKey } from './schemas.js';

// ── HTTP types ──────────────────────────────────────────────────────────

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

export interface PrototypeRecorderContext {
  readonly service: PrototypeRecorderService;
  /** Resolve the authenticated subject id (for DSR endpoints). */
  resolveSubjectId?: (req: HttpRequest) => string | undefined;
  /** Resolve the operator principal (for key rotation). */
  resolveOperatorId?: (req: HttpRequest) => string | undefined;
}

// ── Response helpers ───────────────────────────────────────────────────

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function created<T>(body: T): HttpResponse {
  return { status: 201, body };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function forbidden(): HttpResponse {
  return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}
function unprocessable(message: string, code: string, details?: unknown): HttpResponse {
  return {
    status: 422,
    body: { error: message, code, ...(details !== undefined ? { details } : {}) },
  };
}

// ── Session handlers ───────────────────────────────────────────────────

export async function startSessionHandler(
  req: HttpRequest<
    { tenantId: string; deckId: string },
    Record<string, unknown>,
    { subject_id?: string }
  >,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const subjectId = req.query.subject_id ?? ctx.resolveSubjectId?.(req) ?? undefined;
  const v = validateStartSession(req.body);
  if (!v.valid) {
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const session = await ctx.service.startSession(tenantId, {
      ...v.value!,
      deckId: req.params.deckId,
      ...(subjectId !== undefined ? { subjectId } : {}),
    });
    return created(session);
  } catch (e) {
    return mapError(e);
  }
}

export async function listSessionsHandler(
  req: HttpRequest<{ tenantId: string; deckId: string }, undefined, { region?: string }>,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const items = await ctx.service.listSessionsForDeck(
    tenantId,
    req.params.deckId,
    req.query.region ? { region: req.query.region as never } : {},
  );
  return ok({ items });
}

export async function getSessionEventsHandler(
  req: HttpRequest<
    { tenantId: string; sessionId: string },
    undefined,
    Record<string, string | undefined>
  >,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  try {
    const session = await ctx.service.getSession(tenantId, req.params.sessionId);
    const events = await ctx.service.listEventsForSession(tenantId, session.id);
    return ok({ session, events });
  } catch (e) {
    return mapError(e);
  }
}

// ── Bulk ingest ────────────────────────────────────────────────────────

export async function ingestBatchHandler(
  req: HttpRequest<
    { tenantId: string },
    Record<string, unknown>,
    Record<string, string | undefined>
  >,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const v = validateIngestBatch(req.body);
  if (!v.valid) {
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const events = await ctx.service.ingestBatch(tenantId, v.value!);
    return ok({ accepted: events.length, events });
  } catch (e) {
    return mapError(e);
  }
}

// ── Key rotation (operator-only) ───────────────────────────────────────

export async function rotateKeyHandler(
  req: HttpRequest<
    { tenantId: string },
    Record<string, unknown>,
    Record<string, string | undefined>
  >,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const operatorId = ctx.resolveOperatorId?.(req);
  if (!operatorId) return forbidden();
  const v = validateRotateKey(req.body);
  if (!v.valid) {
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const key = await ctx.service.rotateOperatorKey(tenantId, v.value!.deckId);
    return created({
      id: key.id,
      kid: key.kid,
      rotatedAt: key.rotatedAt,
      expiresAt: key.expiresAt,
      overlapUntil: key.overlapUntil,
    });
  } catch (e) {
    return mapError(e);
  }
}

export async function listKeysHandler(
  req: HttpRequest<{ tenantId: string }, undefined, { deck_id?: string }>,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const operatorId = ctx.resolveOperatorId?.(req);
  if (!operatorId) return forbidden();
  if (!req.query.deck_id) return badRequest('deck_id required', 'VALIDATION_ERROR');
  const items = await ctx.service.listKeys(tenantId, req.query.deck_id);
  return ok({
    items: items.map((k) => ({
      id: k.id,
      kid: k.kid,
      rotatedAt: k.rotatedAt,
      expiresAt: k.expiresAt,
      overlapUntil: k.overlapUntil,
    })),
  });
}

// ── Error mapping ───────────────────────────────────────────────────────

function mapError(e: unknown): HttpResponse {
  if (e instanceof NotFoundError) return notFound(e.message);
  if (e instanceof HmacVerificationError) return conflict(e.message, e.code);
  if (e instanceof ReorderDetectedError) return conflict(e.message, e.code);
  if (e instanceof RegionMismatchError) return conflict(e.message, e.code);
  if (e instanceof ValidationError) return unprocessable(e.message, e.code);
  if (e instanceof HmacKeyGenerationError) return unprocessable(e.message, e.code);
  throw e;
}

export const handlers = {
  startSession: startSessionHandler,
  listSessions: listSessionsHandler,
  getSessionEvents: getSessionEventsHandler,
  ingestBatch: ingestBatchHandler,
  rotateKey: rotateKeyHandler,
  listKeys: listKeysHandler,
} as const;
