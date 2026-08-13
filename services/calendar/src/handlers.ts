/**
 * Calendar REST handlers (Phase 18 W3).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints (from contracts/openapi/v1/collab.yaml):
 *   POST   /v1/decks/{deck_id}/calendar-links          createCalendarLink
 *   GET    /v1/decks/{deck_id}/calendar-links          listCalendarLinks
 *   DELETE /v1/calendar-links/{id}                      deleteCalendarLink
 *   POST   /v1/calendar-links/{id}/sync                 syncCalendarLink
 *   GET    /v1/calendar-links/today                     getPresenterTodayView
 */

import type { CalendarLinkInput } from './types.js';
import type { CalendarService } from './service.js';
import {
  CalendarLinkNotFoundError,
  DuplicateCalendarLinkError,
  CalendarValidationError,
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

export interface CalendarHandlerContext {
  readonly service: CalendarService;
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
function badRequest(message: string, _code: string): HttpResponse {
  return {
    status: 400,
    body: {
      type: 'https://domio.example/problems/validation',
      title: 'Validation error',
      status: 400,
      detail: message,
      instance: '',
    },
  };
}
function notFound(message: string): HttpResponse {
  return {
    status: 404,
    body: {
      type: 'https://domio.example/problems/not-found',
      title: 'Not found',
      status: 404,
      detail: message,
      instance: '',
    },
  };
}
function conflict(message: string, _code: string): HttpResponse {
  return {
    status: 409,
    body: {
      type: 'https://domio.example/problems/conflict',
      title: 'Conflict',
      status: 409,
      detail: message,
      instance: '',
    },
  };
}
function serviceUnavailable(message: string, _code: string): HttpResponse {
  return {
    status: 503,
    body: {
      type: 'https://domio.example/problems/service-unavailable',
      title: 'Service unavailable',
      status: 503,
      detail: message,
      instance: '',
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
  if (e instanceof CalendarValidationError) return badRequest(e.message, e.code);
  if (e instanceof CalendarLinkNotFoundError) return notFound(e.message);
  if (e instanceof DuplicateCalendarLinkError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/calendar-links
// ---------------------------------------------------------------------------

export async function createCalendarLinkHandler(
  req: HttpRequest<{ deck_id: string }, CalendarLinkInput>,
  ctx: CalendarHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const deckId = req.params.deck_id;
    const workspaceId = (req.headers['x-workspace-id'] ??
      (req.query as Record<string, string | undefined>).workspaceId ??
      '') as string;

    const link = await ctx.service.createLink(
      { ...req.body, deck_id: deckId },
      actorId,
      workspaceId,
    );
    return created(link);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/decks/{deck_id}/calendar-links
// ---------------------------------------------------------------------------

export async function listCalendarLinksHandler(
  req: HttpRequest<{ deck_id: string }>,
  ctx: CalendarHandlerContext,
): Promise<HttpResponse> {
  try {
    const deckId = req.params.deck_id;
    const links = await ctx.service.listLinks(deckId);
    return ok(links);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/calendar-links/{id}
// ---------------------------------------------------------------------------

export async function deleteCalendarLinkHandler(
  req: HttpRequest<{ id: string }>,
  ctx: CalendarHandlerContext,
): Promise<HttpResponse> {
  try {
    await ctx.service.deleteLink(req.params.id);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/calendar-links/{id}/sync
// ---------------------------------------------------------------------------

export async function syncCalendarLinkHandler(
  req: HttpRequest<{ id: string }>,
  ctx: CalendarHandlerContext,
): Promise<HttpResponse> {
  try {
    const link = await ctx.service.syncLink(req.params.id);
    return ok(link);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/calendar-links/today
// ---------------------------------------------------------------------------

export async function getPresenterTodayViewHandler(
  req: HttpRequest<Record<string, never>, undefined, Record<string, string | undefined>>,
  ctx: CalendarHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const items = await ctx.service.getPresenterTodayView(actorId);
    return ok(items);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createCalendarLink: createCalendarLinkHandler,
  listCalendarLinks: listCalendarLinksHandler,
  deleteCalendarLink: deleteCalendarLinkHandler,
  syncCalendarLink: syncCalendarLinkHandler,
  getPresenterTodayView: getPresenterTodayViewHandler,
} as const;
