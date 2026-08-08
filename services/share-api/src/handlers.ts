/**
 * Share-link REST handlers (Phase 14 W1).
 *
 * Mirrors the export-pipeline handlers pattern: transport-agnostic
 * `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST   /v1/shares                     createShare  (201)
 *   GET    /v1/shares/{link_id}           getShare     (200/404)
 *   PATCH  /v1/shares/{link_id}           updateShare  (200/400/404/409)
 *   DELETE /v1/shares/{link_id}           revokeShare  (200/404/409)
 *   POST   /v1/shares/{link_id}/rotate-token           (200/404/409)
 *   POST   /v1/shares/{link_id}/extend-expiry           (200/400/404/409)
 *   GET    /v1/shares/{link_id}/policy    getPolicy    (200/404)
 *   PUT    /v1/shares/{link_id}/policy    putPolicy    (200/400/404)
 *   POST   /mcp/share-introspect          introspect   (200/400/404)
 */

import type {
  CreateShareInput,
  ExtendExpiryInput,
  LinkPolicy,
  ShareLink,
  UpdateShareInput,
  ViewerTuple,
} from './types.js';
import {
  ShareApprovalRequiredError,
  ShareConflictError,
  ShareNotFoundError,
  ShareRevokedError,
  ShareValidationError,
} from './types.js';
import {
  ConcurrentModificationError,
  ShareLinkSnapshot,
  ShortIdCollisionError,
} from './store/store.js';
import type { ShareService } from './service.js';

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

export interface ShareHandlerContext {
  readonly service: ShareService;
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
function forbidden(detail: string): HttpResponse {
  return {
    status: 403,
    body: {
      type: 'external_share_requires_approval',
      status: 403,
      title: 'External share requires approval',
      detail,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readExpectedSeq(req: HttpRequest<unknown, unknown>): number {
  const raw = req.headers['if-match'];
  if (!raw) return 1; // assume first write is at seq 1
  // Strip optional surrounding quotes per RFC 7232.
  const stripped = raw.replace(/^"|"$/g, '');
  const n = Number(stripped);
  if (!Number.isFinite(n) || n < 1) {
    throw new ShareValidationError(`invalid If-Match header: ${raw}`);
  }
  return n;
}

function snapshotToDto(snap: ShareLinkSnapshot): ShareLinkSnapshotDto {
  return {
    link: linkToDto(snap.link),
    policy: policyToDto(snap.policy),
  };
}

function linkToDto(l: ShareLink): ShareLinkDto {
  return {
    id: l.id,
    workspaceId: l.workspaceId,
    deckId: l.deckId,
    shortId: l.shortId,
    slug: l.slug,
    tokenHash: l.tokenHash,
    status: l.status,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    revokedBy: l.revokedBy,
    watermarkProfileId: l.watermarkProfileId,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    createdBy: l.createdBy,
    updatedBy: l.updatedBy,
  };
}

function policyToDto(p: LinkPolicy): LinkPolicyDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    shareLinkId: p.shareLinkId,
    visibility: p.visibility,
    allowedViewers: p.allowedViewers,
    maxViews: p.maxViews,
    viewCount: p.viewCount,
    allowDownload: p.allowDownload,
    allowPrint: p.allowPrint,
    allowEmbed: p.allowEmbed,
    requirePasscode: p.requirePasscode,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DTO shapes (response bodies). `Record<string, unknown>` is fine here —
// these are wire-level contracts; the public schemas are in
// `contracts/openapi/v1/shares.yaml`.
// ---------------------------------------------------------------------------

interface ShareLinkDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly deckId: string;
  readonly shortId: string;
  readonly slug: string | null;
  readonly tokenHash: string | null;
  readonly status: ShareLink['status'];
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly watermarkProfileId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

interface LinkPolicyDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly shareLinkId: string;
  readonly visibility: LinkPolicy['visibility'];
  readonly allowedViewers: readonly ViewerTuple[];
  readonly maxViews: number | null;
  readonly viewCount: number;
  readonly allowDownload: boolean;
  readonly allowPrint: boolean;
  readonly allowEmbed: boolean;
  readonly requirePasscode: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ShareLinkSnapshotDto {
  readonly link: ShareLinkDto;
  readonly policy: LinkPolicyDto;
}

// ---------------------------------------------------------------------------
// POST /v1/shares
// ---------------------------------------------------------------------------

export async function createShareHandler(
  req: HttpRequest<Record<string, never>, CreateShareInput>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const { snapshot, token } = await ctx.service.createShare(req.body);
    return created({ ...snapshotToDto(snapshot), token });
  } catch (e) {
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    if (e instanceof ShortIdCollisionError) return conflict(e.message, e.code);
    if (e instanceof ShareConflictError) return conflict(e.message, e.code);
    if (e instanceof ShareApprovalRequiredError) return forbidden(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// GET /v1/shares/{id}
// ---------------------------------------------------------------------------

export async function getShareHandler(
  req: HttpRequest<{ link_id: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const snap = await ctx.service.getShare(req.query.workspaceId ?? '', req.params.link_id);
    return ok(snapshotToDto(snap));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/shares/{id}
// ---------------------------------------------------------------------------

export async function updateShareHandler(
  req: HttpRequest<{ link_id: string }, UpdateShareInput & { workspaceId: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const expectedSeq = readExpectedSeq(req);
    const snap = await ctx.service.updateShare(
      req.body.workspaceId,
      req.params.link_id,
      req.body,
      expectedSeq,
    );
    return ok(snapshotToDto(snap));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    if (e instanceof ShareConflictError) return conflict(e.message, e.code);
    if (e instanceof ConcurrentModificationError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/shares/{id}
// ---------------------------------------------------------------------------

export async function revokeShareHandler(
  req: HttpRequest<{ link_id: string }, { workspaceId: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const expectedSeq = readExpectedSeq(req);
    const snap = await ctx.service.revokeShare(
      req.body.workspaceId,
      req.params.link_id,
      req.headers['x-actor-id'] ?? '',
      expectedSeq,
    );
    return ok(snapshotToDto(snap));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareConflictError) return conflict(e.message, e.code);
    if (e instanceof ConcurrentModificationError) return conflict(e.message, e.code);
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// POST /v1/shares/{id}/rotate-token
// ---------------------------------------------------------------------------

export async function rotateTokenHandler(
  req: HttpRequest<{ link_id: string }, { workspaceId: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const expectedSeq = readExpectedSeq(req);
    const { snapshot, token } = await ctx.service.rotateShareToken(
      req.body.workspaceId,
      req.params.link_id,
      req.headers['x-actor-id'] ?? '',
      expectedSeq,
    );
    return ok({ ...snapshotToDto(snapshot), token });
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareConflictError) return conflict(e.message, e.code);
    if (e instanceof ConcurrentModificationError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// POST /v1/shares/{id}/extend-expiry
// ---------------------------------------------------------------------------

export async function extendExpiryHandler(
  req: HttpRequest<{ link_id: string }, ExtendExpiryInput & { workspaceId: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const expectedSeq = readExpectedSeq(req);
    const snap = await ctx.service.extendExpiry(
      req.body.workspaceId,
      req.params.link_id,
      { actorId: req.body.actorId, expiresAt: new Date(req.body.expiresAt as unknown as string) },
      expectedSeq,
    );
    return ok(snapshotToDto(snap));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    if (e instanceof ConcurrentModificationError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// GET /v1/shares/{id}/policy
// ---------------------------------------------------------------------------

export async function getPolicyHandler(
  req: HttpRequest<{ link_id: string }, undefined, { workspaceId?: string }>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const ws = req.query.workspaceId ?? '';
    if (!ws) return badRequest('workspaceId query param is required', 'WORKSPACE_ID_REQUIRED');
    const policy = await ctx.service.getSharePolicy(ws, req.params.link_id);
    return ok(policyToDto(policy));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// PUT /v1/shares/{id}/policy
// ---------------------------------------------------------------------------

export interface PutPolicyInput {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly visibility?: LinkPolicy['visibility'];
  readonly allowedViewers?: readonly ViewerTuple[];
  readonly maxViews?: number | null;
  readonly allowDownload?: boolean;
  readonly allowPrint?: boolean;
  readonly allowEmbed?: boolean;
  readonly requirePasscode?: boolean;
}

export async function putPolicyHandler(
  req: HttpRequest<{ link_id: string }, PutPolicyInput>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const expectedSeq = readExpectedSeq(req);
    const patch: UpdateShareInput = {
      actorId: req.body.actorId,
      ...(req.body.visibility !== undefined ? { visibility: req.body.visibility } : {}),
      ...(req.body.allowedViewers !== undefined ? { allowedViewers: req.body.allowedViewers } : {}),
      ...(req.body.maxViews !== undefined ? { maxViews: req.body.maxViews } : {}),
      ...(req.body.allowDownload !== undefined ? { allowDownload: req.body.allowDownload } : {}),
      ...(req.body.allowPrint !== undefined ? { allowPrint: req.body.allowPrint } : {}),
      ...(req.body.allowEmbed !== undefined ? { allowEmbed: req.body.allowEmbed } : {}),
      ...(req.body.requirePasscode !== undefined ? { requirePasscode: req.body.requirePasscode } : {}),
    };
    const snap = await ctx.service.updateShare(
      req.body.workspaceId,
      req.params.link_id,
      patch,
      expectedSeq,
    );
    return ok(policyToDto(snap.policy));
  } catch (e) {
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    if (e instanceof ShareConflictError) return conflict(e.message, e.code);
    if (e instanceof ConcurrentModificationError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// POST /mcp/share-introspect  (token verification)
// ---------------------------------------------------------------------------

export interface IntrospectRequestBody {
  readonly workspaceId: string;
  readonly shortId: string;
  readonly token: string;
}

export async function shareIntrospectHandler(
  req: HttpRequest<Record<string, never>, IntrospectRequestBody>,
  ctx: ShareHandlerContext,
): Promise<HttpResponse> {
  try {
    const result = await ctx.service.introspect(req.body.workspaceId, req.body.shortId, req.body.token);
    return ok({
      short_id: result.claims.short_id,
      link_id: result.claims.link_id,
      workspace_id: result.claims.workspace_id,
      audience: result.claims.audience ?? null,
      grants: result.claims.grants ?? [],
      expires_at_sec: result.expiresAtSec,
    });
  } catch (e) {
    if (e instanceof ShareValidationError) return badRequest(e.message, e.code);
    if (e instanceof ShareNotFoundError) return notFound(e.message);
    if (e instanceof ShareRevokedError) return conflict(e.message, e.code);
    if (e instanceof ShareApprovalRequiredError) return forbidden(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createShare: createShareHandler,
  getShare: getShareHandler,
  updateShare: updateShareHandler,
  revokeShare: revokeShareHandler,
  rotateToken: rotateTokenHandler,
  extendExpiry: extendExpiryHandler,
  getPolicy: getPolicyHandler,
  putPolicy: putPolicyHandler,
  shareIntrospect: shareIntrospectHandler,
} as const;