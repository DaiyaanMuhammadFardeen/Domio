/**
 * Guest REST handlers (Phase 18).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST   /v1/guests                    createGuest
 *   GET    /v1/guests/{id}               getGuest
 *   DELETE /v1/guests/{id}               deleteGuest
 *   POST   /v1/guests/{id}/magic-link    resendGuestMagicLink
 *   POST   /v1/guest-access/consume      consumeGuestMagicLink
 */

import type { CreateGuestInput } from './types.js';
import type { GuestService } from './service.js';
import {
  GuestNotFoundError,
  MagicLinkInvalidError,
  MagicLinkExpiredError,
  MagicLinkConsumedError,
  MagicLinkInvalidatedError,
  GuestRevokedError,
  GuestExpiredError,
  InvalidCapabilityError,
  FeatureDisabledError,
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

export interface GuestHandlerContext {
  readonly service: GuestService;
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
function unauthorized(message: string, code: string): HttpResponse {
  return { status: 401, body: { error: message, code } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function gone(message: string, code: string): HttpResponse {
  return { status: 410, body: { error: message, code } };
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
  if (e instanceof GuestNotFoundError) return notFound(e.message);
  if (e instanceof InvalidCapabilityError) return badRequest(e.message, e.code);
  if (e instanceof MagicLinkInvalidError) return unauthorized(e.message, e.code);
  if (e instanceof MagicLinkExpiredError) return unauthorized(e.message, e.code);
  if (e instanceof MagicLinkConsumedError) return gone(e.message, e.code);
  if (e instanceof MagicLinkInvalidatedError) return gone(e.message, e.code);
  if (e instanceof GuestRevokedError) return gone(e.message, e.code);
  if (e instanceof GuestExpiredError) return gone(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/guests
// ---------------------------------------------------------------------------

export async function createGuestHandler(
  req: HttpRequest<Record<string, never>, CreateGuestInput>,
  ctx: GuestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { guest, magic_link_token, magic_link_expires_at } = await ctx.service.createGuest(
      req.body,
      actorId,
    );
    return created({ guest, magic_link_token, magic_link_expires_at });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/guests/{id}
// ---------------------------------------------------------------------------

export async function getGuestHandler(
  req: HttpRequest<{ id: string }>,
  ctx: GuestHandlerContext,
): Promise<HttpResponse> {
  try {
    const guest = await ctx.service.getGuest(req.params.id);
    return ok({ guest });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/guests/{id}
// ---------------------------------------------------------------------------

export async function deleteGuestHandler(
  req: HttpRequest<{ id: string }>,
  ctx: GuestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    await ctx.service.deleteGuest(req.params.id, actorId);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/guests/{id}/magic-link
// ---------------------------------------------------------------------------

export async function resendGuestMagicLinkHandler(
  req: HttpRequest<{ id: string }>,
  ctx: GuestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { magic_link_token, magic_link_expires_at } = await ctx.service.resendMagicLink(
      req.params.id,
      actorId,
    );
    return ok({ magic_link_token, magic_link_expires_at });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/guest-access/consume
// ---------------------------------------------------------------------------

export async function consumeGuestMagicLinkHandler(
  req: HttpRequest<Record<string, never>, { token: string; guest_user_id?: string }>,
  ctx: GuestHandlerContext,
): Promise<HttpResponse> {
  try {
    const now = new Date();
    const result = await ctx.service.consumeMagicLink(req.body.token, now, req.body.guest_user_id);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createGuest: createGuestHandler,
  getGuest: getGuestHandler,
  deleteGuest: deleteGuestHandler,
  resendGuestMagicLink: resendGuestMagicLinkHandler,
  consumeGuestMagicLink: consumeGuestMagicLinkHandler,
} as const;
