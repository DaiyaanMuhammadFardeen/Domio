/**
 * Merge request REST handlers (Phase 18 W2).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints (from contracts/openapi/v1/collab.yaml):
 *   POST   /v1/decks/{deck_id}/merge-requests         createMergeRequest
 *   GET    /v1/decks/{deck_id}/merge-requests         listMergeRequests
 *   GET    /v1/merge-requests/{id}/diffs              getMergeRequestDiffs
 *   POST   /v1/merge-requests/{id}/merge              mergeMergeRequest
 *   POST   /v1/merge-requests/{id}/resolve-conflict   resolveMergeRequestConflict
 */

import type {
  MergeRequestInput,
  SlideDiffLevel,
  ConflictResolution,
  DeckSnapshot,
} from './types.js';
import type { MergeRequestService } from './service.js';
import {
  MergeRequestNotFoundError,
  MergeRequestValidationError,
  ConflictsUnresolvedError,
  MergeValidationFailedError,
  FeatureDisabledError,
  SlideDiffNotFoundError,
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

export interface MergeRequestHandlerContext {
  readonly service: MergeRequestService;
  /** Optional deck snapshot provider for validation hooks. */
  readonly getDeckSnapshot?: (deckId: string) => Promise<DeckSnapshot | null>;
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
  if (e instanceof MergeRequestValidationError) return badRequest(e.message, e.code);
  if (e instanceof MergeRequestNotFoundError) return notFound(e.message);
  if (e instanceof SlideDiffNotFoundError) return notFound(e.message);
  if (e instanceof ConflictsUnresolvedError) return conflict(e.message, e.code);
  if (e instanceof MergeValidationFailedError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/merge-requests
// ---------------------------------------------------------------------------

export async function createMergeRequestHandler(
  req: HttpRequest<{ deck_id: string }, MergeRequestInput>,
  ctx: MergeRequestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const deckId = req.params.deck_id;

    // Default empty snapshots — real CRDT replay is a later wave
    const emptyDeck = { slides: [] };

    // Use workspace_id from header or query, default empty
    const workspaceId = (req.headers['x-workspace-id'] ??
      (req.query as Record<string, string | undefined>).workspaceId ??
      '') as string;

    const mr = await ctx.service.createMergeRequest(
      req.body,
      actorId,
      workspaceId,
      deckId,
      emptyDeck,
      emptyDeck,
      emptyDeck,
    );
    return created(mr);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/decks/{deck_id}/merge-requests
// ---------------------------------------------------------------------------

export async function listMergeRequestsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { status?: string }>,
  ctx: MergeRequestHandlerContext,
): Promise<HttpResponse> {
  try {
    const deckId = req.params.deck_id;
    const status = req.query.status as string | undefined;
    const mrs = await ctx.service.listMergeRequests(
      deckId,
      status
        ? { status: status as 'open' | 'approved' | 'merged' | 'closed' | 'conflict' }
        : undefined,
    );
    return ok(mrs);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/merge-requests/{id}/diffs
// ---------------------------------------------------------------------------

export async function getMergeRequestDiffsHandler(
  req: HttpRequest<{ id: string }, undefined, { level?: string }>,
  ctx: MergeRequestHandlerContext,
): Promise<HttpResponse> {
  try {
    const level = (req.query.level ?? 'slide') as SlideDiffLevel;
    const diff = await ctx.service.getMergeRequestDiffs(req.params.id, level);
    return ok(diff);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/merge-requests/{id}/merge
// ---------------------------------------------------------------------------

export async function mergeMergeRequestHandler(
  req: HttpRequest<{ id: string }>,
  ctx: MergeRequestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const workspaceId = (req.headers['x-workspace-id'] ?? '') as string;

    // Get deck snapshot for validation if provider is available
    let deckSnapshot: DeckSnapshot | undefined;
    if (ctx.getDeckSnapshot) {
      const mr = await ctx.service.getMergeRequest(req.params.id);
      const snapshot = await ctx.getDeckSnapshot(mr.deck_id);
      if (snapshot) deckSnapshot = snapshot;
    }

    const mr = await ctx.service.mergeMergeRequest(
      req.params.id,
      actorId,
      workspaceId,
      deckSnapshot,
    );
    return ok({ status: mr.status, merge_commit_id: mr.merge_commit_id });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/merge-requests/{id}/resolve-conflict
// ---------------------------------------------------------------------------

export async function resolveMergeRequestConflictHandler(
  req: HttpRequest<
    { id: string },
    { slide_id: string; resolution: ConflictResolution['resolution'] }
  >,
  ctx: MergeRequestHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const workspaceId = (req.headers['x-workspace-id'] ?? '') as string;

    const resolution: ConflictResolution = {
      slide_id: req.body.slide_id,
      resolution: req.body.resolution,
    };

    const mr = await ctx.service.resolveMergeRequestConflict(
      req.params.id,
      [resolution],
      actorId,
      workspaceId,
    );
    return ok(mr);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createMergeRequest: createMergeRequestHandler,
  listMergeRequests: listMergeRequestsHandler,
  getMergeRequestDiffs: getMergeRequestDiffsHandler,
  mergeMergeRequest: mergeMergeRequestHandler,
  resolveMergeRequestConflict: resolveMergeRequestConflictHandler,
} as const;
