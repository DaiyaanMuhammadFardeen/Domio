/**
 * Prototype-recorder service — DSR endpoints (Phase 10 M5).
 *
 * Data Subject Request handlers (PDPA / GDPR right-to-erasure):
 *   - GET    /v1/me/telemetry_sessions      — list my own sessions
 *   - DELETE /v1/me/telemetry_sessions/:id  — hard-delete my own session
 *   - DELETE /v1/me/telemetry_sessions      — bulk delete with ?before=ISO-ts
 *
 * The hard-delete is synchronous on the same call; the cron in
 * `retention.ts` enforces the 24 h SLA on stale *expires_at* items.
 */

import type { PrototypeSession } from './types.js';
import { NotFoundError, ValidationError } from './dal.js';
import type { HttpRequest, HttpResponse, PrototypeRecorderContext } from './handlers.js';

// Same response helpers are inlined to keep this module free of
// cross-imports (handlers re-uses the helpers, but ts-build is fine
// with redeclaration under distinct symbols).
function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
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

// ── DSR handlers ──────────────────────────────────────────────────────

export async function listMySessionsHandler(
  req: HttpRequest<unknown, undefined, { tenant_id?: string }>,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const subjectId = ctx.resolveSubjectId?.(req);
  if (!subjectId) return unauthorized();
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('tenant_id required', 'VALIDATION_ERROR');
  const sessions = await ctx.service.listMySessions(tenantId, subjectId);
  return ok({ items: sessions.map(stripSession) });
}

export async function deleteMySessionHandler(
  req: HttpRequest<{ sessionId: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const subjectId = ctx.resolveSubjectId?.(req);
  if (!subjectId) return unauthorized();
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('tenant_id required', 'VALIDATION_ERROR');

  // Confirm the session belongs to the subject before deleting.
  const all = await ctx.service.listMySessions(tenantId, subjectId);
  const match = all.find((s) => s.id === req.params.sessionId);
  if (!match) {
    // Return 404 rather than 403 to avoid leaking existence.
    return notFound(`session ${req.params.sessionId} not found`);
  }
  try {
    const { deletedEvents } = await ctx.service.deleteSession(tenantId, req.params.sessionId);
    return ok({ deleted: true, deletedEvents });
  } catch (e) {
    if (e instanceof NotFoundError) return notFound(e.message);
    if (e instanceof ValidationError) return badRequest(e.message, e.code);
    throw e;
  }
}

export async function deleteSessionsBeforeHandler(
  req: HttpRequest<unknown, undefined, { tenant_id?: string; before?: string }>,
  ctx: PrototypeRecorderContext,
): Promise<HttpResponse> {
  const subjectId = ctx.resolveSubjectId?.(req);
  if (!subjectId) return unauthorized();
  const tenantId = req.query.tenant_id;
  if (!tenantId) return badRequest('tenant_id required', 'VALIDATION_ERROR');
  if (!req.query.before) return badRequest('before required (ms epoch)', 'VALIDATION_ERROR');
  const cutoff = Number(req.query.before);
  if (!Number.isFinite(cutoff)) return badRequest('before must be integer ms', 'VALIDATION_ERROR');

  const mine = await ctx.service.listMySessions(tenantId, subjectId);
  const targets = mine.filter((s) => s.expiresAt <= cutoff);
  let deleted = 0;
  let deletedEvents = 0;
  for (const s of targets) {
    const result = await ctx.service.deleteSession(tenantId, s.id);
    deletedEvents += result.deletedEvents;
    deleted += 1;
  }
  return ok({ deleted, deletedEvents, before: cutoff });
}

// ── Helpers ──────────────────────────────────────────────────────────

function stripSession(s: PrototypeSession): Record<string, unknown> {
  return {
    id: s.id,
    deckId: s.deckId,
    startedAt: s.startedAt,
    lastEventAt: s.lastEventAt,
    expiresAt: s.expiresAt,
    consent: s.consent,
    region: s.region,
    regionPinned: s.regionPinned,
    sessionToken: s.sessionToken,
    abVariant: s.abVariant,
    samplingRate: s.samplingRate,
    lastSeq: s.lastSeq,
  };
}
