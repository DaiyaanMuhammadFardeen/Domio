/**
 * Deep-link service — HTTP handlers (Phase 10 M7).
 *
 * Web-framework-free handlers that compose the service facade.
 * Follows the same `ok / created / noContent / badRequest /
 * unauthorized / notFound / conflict / unprocessable` shape as
 * `services/prototype-runtime/src/handlers.ts`.
 */

import { NotFoundError, DeepLinkValidationError, DeepLinkAudienceError } from './dal.js';
import { DeepLinkResolveError, type DeepLinkService } from './service.js';
import type {
  DeepLinkAudience,
  DeepLinkVarEntry,
  DeepLinkViewerScope,
} from '@domio/deep-link';

// ── HTTP types ─────────────────────────────────────────────────────────

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

export interface DeepLinkHandlerContext {
  readonly service: DeepLinkService;
  resolveActorId?: (req: HttpRequest<unknown, unknown, Record<string, string | undefined>>) => string | undefined;
}

function ok<T>(body: T): HttpResponse { return { status: 200, body }; }
function created<T>(body: T): HttpResponse { return { status: 201, body }; }
function noContent(): HttpResponse { return { status: 204, body: null }; }
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function conflict(message: string, code: string): HttpResponse {
  return { status: 409, body: { error: message, code } };
}
function unprocessable(message: string, code: string, details?: unknown): HttpResponse {
  return {
    status: 422,
    body: { error: message, code, ...(details !== undefined ? { details } : {}) },
  };
}

// ── Shorten handler ────────────────────────────────────────────────────

export interface ShortenPath { tenantId: string; deckId: string }
export interface ShortenBody {
  slide_id?: string;
  path_stack?: readonly string[];
  overlay_stack?: readonly string[];
  var_snapshot?: readonly DeepLinkVarEntry[];
  device_frame_state?: Readonly<Record<string, unknown>>;
  scenario?: string;
  form_drafts?: Readonly<Record<string, unknown>>;
  audience?: DeepLinkAudience;
  viewer_scope?: DeepLinkViewerScope;
  single_use?: boolean;
  ttl_seconds?: number;
  authoring_viewer_id?: string;
}
export interface ShortenQuery { tenant_id?: string }

export async function shortenHandler(
  req: HttpRequest<ShortenPath, ShortenBody, ShortenQuery>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const baseReq = req as unknown as HttpRequest<unknown, unknown, Record<string, string | undefined>>;
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(baseReq);
  if (!tenantId) return unauthorized();
  const body = req.body ?? {};
  if (!body.slide_id) {
    return badRequest('slide_id is required', 'VALIDATION_ERROR');
  }
  const actorId = ctx.resolveActorId?.(baseReq);
  try {
    const result = await ctx.service.shorten({
      tenant_id: tenantId,
      deck_id: req.params.deckId,
      slide_id: body.slide_id,
      ...(body.path_stack ? { path_stack: body.path_stack } : {}),
      ...(body.overlay_stack ? { overlay_stack: body.overlay_stack } : {}),
      ...(body.var_snapshot ? { var_snapshot: body.var_snapshot } : {}),
      ...(body.device_frame_state ? { device_frame_state: body.device_frame_state } : {}),
      ...(body.scenario !== undefined ? { scenario: body.scenario } : {}),
      ...(body.form_drafts ? { form_drafts: body.form_drafts } : {}),
      ...(body.audience ? { audience: body.audience } : {}),
      ...(body.viewer_scope ? { viewer_scope: body.viewer_scope } : {}),
      ...(body.single_use !== undefined ? { single_use: body.single_use } : {}),
      ...(body.ttl_seconds !== undefined ? { ttl_seconds: body.ttl_seconds } : {}),
      ...(body.authoring_viewer_id !== undefined ? { authoring_viewer_id: body.authoring_viewer_id } : {}),
      ...(actorId !== undefined ? { created_by: actorId } : {}),
    });
    return created(result);
  } catch (e) {
    return mapError(e);
  }
}

// ── Resolve handler ────────────────────────────────────────────────────

export interface ResolvePath { readonly tenantId: string }
export interface ResolveBody {
  id?: string;
  audience?: DeepLinkAudience;
  requesting_viewer_id?: string;
}

export async function resolveHandler(
  req: HttpRequest<ResolvePath, ResolveBody, Record<string, string | undefined>>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const body = req.body ?? {};
  if (!body.id) return badRequest('id is required', 'VALIDATION_ERROR');
  if (!body.audience) return badRequest('audience is required', 'VALIDATION_ERROR');
  try {
    const result = await ctx.service.resolve({
      tenant_id: tenantId,
      id: body.id,
      audience: body.audience,
      ...(body.requesting_viewer_id ? { requesting_viewer_id: body.requesting_viewer_id } : {}),
    });
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ── Delete handler ─────────────────────────────────────────────────────

export interface DeletePath { readonly tenantId: string; readonly id: string }

export async function deleteHandler(
  req: HttpRequest<DeletePath, unknown, Record<string, string | undefined>>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  try {
    const ok2 = await ctx.service.delete(tenantId, req.params.id);
    if (!ok2) return notFound(`Deep link ${req.params.id} not found`);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ── Stats handler ──────────────────────────────────────────────────────

export interface StatsPath { readonly tenantId: string; readonly id: string }

export async function statsHandler(
  req: HttpRequest<StatsPath, unknown, Record<string, string | undefined>>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  try {
    return ok(await ctx.service.stats(tenantId, req.params.id));
  } catch (e) {
    return mapError(e);
  }
}

// ── List handler ───────────────────────────────────────────────────────

export interface ListPath { readonly tenantId: string; readonly deckId: string }

export async function listHandler(
  req: HttpRequest<ListPath, unknown, Record<string, string | undefined>>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.params.tenantId;
  const items = await ctx.service.list(tenantId, req.params.deckId);
  return ok({ items });
}

// ── Rotate key handler (admin) ─────────────────────────────────────────

export interface RotatePath { readonly tenantId: string; readonly deckId: string }

export async function rotateKeyHandler(
  req: HttpRequest<RotatePath, unknown, Record<string, string | undefined>>,
  ctx: DeepLinkHandlerContext,
): Promise<HttpResponse> {
  const result = await ctx.service.rotateKey(req.params.tenantId, req.params.deckId);
  return ok(result);
}

// ── Error mapping ──────────────────────────────────────────────────────

function mapError(e: unknown): HttpResponse {
  if (e instanceof NotFoundError) return notFound(e.message);
  if (e instanceof DeepLinkValidationError) {
    return unprocessable(e.message, e.code);
  }
  if (e instanceof DeepLinkAudienceError) {
    return unprocessable(e.message, e.code);
  }
  if (e instanceof DeepLinkResolveError) {
    switch (e.code) {
      case 'DEEP_LINK_EXPIRED':
        return conflict(e.message, e.code);
      case 'DEEP_LINK_REPLAY_REJECTED':
        return conflict(e.message, e.code);
      case 'DEEP_LINK_SIGNATURE_INVALID':
      case 'DEEP_LINK_KEY_UNKNOWN':
        return unprocessable(e.message, e.code);
      default:
        return unprocessable(e.message, e.code);
    }
  }
  throw e;
}

export const handlers = {
  shorten: shortenHandler,
  resolve: resolveHandler,
  delete: deleteHandler,
  stats: statsHandler,
  list: listHandler,
  rotateKey: rotateKeyHandler,
} as const;