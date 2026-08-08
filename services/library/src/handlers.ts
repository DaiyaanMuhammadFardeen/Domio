/**
 * Library REST handlers (Phase 18 Wave 3).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST   /v1/library/entries                           createEntry
 *   GET    /v1/library/entries                            listEntries
 *   GET    /v1/library/entries/{id}                       getEntry
 *   POST   /v1/library/entries/{id}/versions              addVersion
 *   POST   /v1/library/entries/{id}/publish               publishEntry
 *   POST   /v1/library/entries/{id}/retire                retireEntry
 *   POST   /v1/decks/{deck_id}/slides/insert-from-library insertFromLibrary
 *   POST   /v1/auto-update/bindings                       createBinding
 *   GET    /v1/auto-update/bindings                       listBindings
 *   PATCH  /v1/auto-update/bindings/{id}                  updateBinding
 *   DELETE /v1/auto-update/bindings/{id}                  deleteBinding
 */

import type { LibrarySnapshotInput, AutoUpdateMode } from './types.js';
import type { LibraryService } from './service.js';
import {
  LibraryValidationError,
  EntryNotFoundError,
  VersionNotFoundError,
  RetiredEntryError,
  SupersedeChainError,
  FeatureDisabledError,
  BindingNotFoundError,
} from './types.js';
import {
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';

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

export interface LibraryHandlerContext {
  readonly service: LibraryService;
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
  return req.headers['x-actor-id'] ?? (req.query as Record<string, string | undefined>).actorId ?? '';
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(e: unknown): HttpResponse {
  if (e instanceof LibraryValidationError) return badRequest(e.message, e.code);
  if (e instanceof EntryNotFoundError) return notFound(e.message);
  if (e instanceof VersionNotFoundError) return notFound(e.message);
  if (e instanceof BindingNotFoundError) return notFound(e.message);
  if (e instanceof RetiredEntryError) return conflict(e.message, e.code);
  if (e instanceof SupersedeChainError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/library/entries
// ---------------------------------------------------------------------------

export async function createEntryHandler(
  req: HttpRequest<Record<string, never>, {
    workspace_id: string;
    scope: string;
    team_id?: string;
    title: string;
    description?: string;
    tags?: readonly string[];
    owner_id: string;
    approval_chain?: Record<string, unknown>;
    snapshot: LibrarySnapshotInput;
  }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { entry, version } = await ctx.service.createEntry(req.body, actorId);
    return created({ entry, version });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/library/entries
// ---------------------------------------------------------------------------

export async function listEntriesHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    const entries = await ctx.service.listEntries(workspaceId);
    return ok({ entries });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/library/entries/{id}
// ---------------------------------------------------------------------------

export async function getEntryHandler(
  req: HttpRequest<{ id: string }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const entry = await ctx.service.getEntry(req.params.id);
    return ok({ entry });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/library/entries/{id}/versions
// ---------------------------------------------------------------------------

export async function addVersionHandler(
  req: HttpRequest<{ id: string }, { snapshot: LibrarySnapshotInput }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const version = await ctx.service.addVersion(req.params.id, req.body.snapshot, actorId);
    return created({ version });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/library/entries/{id}/publish
// ---------------------------------------------------------------------------

export async function publishEntryHandler(
  req: HttpRequest<{ id: string }, Record<string, never>>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const entry = await ctx.service.publishEntry(req.params.id, actorId);
    return ok({ entry });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/library/entries/{id}/retire
// ---------------------------------------------------------------------------

export async function retireEntryHandler(
  req: HttpRequest<{ id: string }, { superseded_by?: string }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const entry = await ctx.service.retireEntry(req.params.id, req.body.superseded_by, actorId);
    return ok({ entry });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/slides/insert-from-library
// ---------------------------------------------------------------------------

export async function insertFromLibraryHandler(
  req: HttpRequest<{ deck_id: string }, {
    entry_id: string;
    mode: 'reference' | 'copy';
    slide_id: string;
    workspace_id: string;
  }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const result = await ctx.service.insertFromLibrary(
      req.body.entry_id,
      req.body.mode,
      req.params.deck_id,
      req.body.slide_id,
      req.body.workspace_id,
      actorId,
    );
    return created(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/auto-update/bindings
// ---------------------------------------------------------------------------

export async function createBindingHandler(
  req: HttpRequest<Record<string, never>, {
    workspace_id: string;
    consumer_deck_id: string;
    consumer_slide_id: string;
    library_entry_id: string;
    pinned_version_id?: string;
    mode: AutoUpdateMode;
    schedule?: Record<string, unknown>;
    is_mandatory?: boolean;
  }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const binding = await ctx.service.createBinding(req.body, actorId);
    return created({ binding });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/auto-update/bindings
// ---------------------------------------------------------------------------

export async function listBindingsHandler(
  req: HttpRequest<Record<string, never>, undefined, { workspace_id?: string }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    const bindings = await ctx.service.listBindings(workspaceId);
    return ok({ bindings });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/auto-update/bindings/{id}
// ---------------------------------------------------------------------------

export async function updateBindingHandler(
  req: HttpRequest<{ id: string }, {
    pinned_version_id?: string;
    mode?: AutoUpdateMode;
    schedule?: Record<string, unknown>;
    is_mandatory?: boolean;
  }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const binding = await ctx.service.updateBinding(req.params.id, req.body, actorId);
    return ok({ binding });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/auto-update/bindings/{id}
// ---------------------------------------------------------------------------

export async function deleteBindingHandler(
  req: HttpRequest<{ id: string }>,
  ctx: LibraryHandlerContext,
): Promise<HttpResponse> {
  try {
    await ctx.service.deleteBinding(req.params.id);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createEntry: createEntryHandler,
  listEntries: listEntriesHandler,
  getEntry: getEntryHandler,
  addVersion: addVersionHandler,
  publishEntry: publishEntryHandler,
  retireEntry: retireEntryHandler,
  insertFromLibrary: insertFromLibraryHandler,
  createBinding: createBindingHandler,
  listBindings: listBindingsHandler,
  updateBinding: updateBindingHandler,
  deleteBinding: deleteBindingHandler,
} as const;
