/**
 * Suggestions REST handlers (Phase 18 #182).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints (from collab.yaml operationIds):
 *   POST   /v1/decks/{deck_id}/suggestions      createSuggestion
 *   GET    /v1/decks/{deck_id}/suggestions       listSuggestions
 *   POST   /v1/suggestions/{id}/accept           acceptSuggestion
 *   POST   /v1/suggestions/{id}/reject           rejectSuggestion
 */

import type { SuggestionOperation, SuggestionStatus } from './types.js';
import type { SuggestionsService } from './service.js';
import {
  SuggestionValidationError,
  SuggestionNotFoundError,
  InvalidStatusTransitionError,
  BrandLockError,
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

export interface SuggestionsHandlerContext {
  readonly service: SuggestionsService;
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
  if (e instanceof SuggestionValidationError) return badRequest(e.message, e.code);
  if (e instanceof SuggestionNotFoundError) return notFound(e.message);
  if (e instanceof InvalidStatusTransitionError) return conflict(e.message, e.code);
  if (e instanceof BrandLockError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/suggestions
// ---------------------------------------------------------------------------

export async function createSuggestionHandler(
  req: HttpRequest<
    { deck_id: string },
    {
      workspace_id: string;
      session_id: string;
      target_type: string;
      target_id: string;
      operation: SuggestionOperation;
      thread_id?: string;
    }
  >,
  ctx: SuggestionsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const suggestion = await ctx.service.createSuggestion(
      {
        ...req.body,
        deck_id: req.params.deck_id,
        author_id: actorId,
      },
      actorId,
    );
    return created(suggestion);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/decks/{deck_id}/suggestions
// ---------------------------------------------------------------------------

export async function listSuggestionsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { status?: string }>,
  ctx: SuggestionsHandlerContext,
): Promise<HttpResponse> {
  try {
    const statusRaw = req.query.status;
    const opts: { status?: SuggestionStatus } = {};
    if (
      statusRaw === 'open' ||
      statusRaw === 'accepted' ||
      statusRaw === 'rejected' ||
      statusRaw === 'obsolete'
    ) {
      opts.status = statusRaw;
    }
    const suggestions = await ctx.service.listSuggestions(req.params.deck_id, opts);
    return ok(suggestions);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/suggestions/{id}/accept
// ---------------------------------------------------------------------------

export async function acceptSuggestionHandler(
  req: HttpRequest<{ id: string }, { break_brand_lock?: boolean }>,
  ctx: SuggestionsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const breakBrandLock = req.body.break_brand_lock ?? false;
    const suggestion = await ctx.service.acceptSuggestion(req.params.id, actorId, breakBrandLock);
    return ok(suggestion);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/suggestions/{id}/reject
// ---------------------------------------------------------------------------

export async function rejectSuggestionHandler(
  req: HttpRequest<{ id: string }, { reason?: string }>,
  ctx: SuggestionsHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const suggestion = await ctx.service.rejectSuggestion(req.params.id, actorId, req.body.reason);
    return ok(suggestion);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createSuggestion: createSuggestionHandler,
  listSuggestions: listSuggestionsHandler,
  acceptSuggestion: acceptSuggestionHandler,
  rejectSuggestion: rejectSuggestionHandler,
} as const;
