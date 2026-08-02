/**
 * Font service — REST handlers.
 *
 * Endpoints:
 *
 *   POST /v1/fonts          uploadFont
 *   GET  /v1/fonts          listFonts (?kitId=, ?orgId=)
 *   GET  /v1/fonts/:fontId  getFont
 *   PATCH /v1/fonts/:fontId/license updateLicense
 *   DELETE /v1/fonts/:fontId deleteFont
 */

import type { FontAxes, FontFormat, FontLicenseStatus } from './dal.js';
import {
  FontService,
  type UploadFontInput,
  FontNotFoundError,
  FontValidationError,
  FontLicenseBlockedError,
} from './service.js';
import type { FontMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';

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

export interface FontHandlerContext {
  readonly service: FontService;
  readonly metrics?: FontMetrics;
  readonly audit?: AuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: { actorId: string | undefined; action: 'read' | 'write' }) => void;
}

function ok<T>(b: T): HttpResponse { return { status: 200, body: b }; }
function created<T>(b: T): HttpResponse { return { status: 201, body: b }; }
function noContent(): HttpResponse { return { status: 204, body: null }; }
function badRequest(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 400, body: { error: message, code, ...(extra ?? {}) } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function notFound(message: string, code: string): HttpResponse {
  return { status: 404, body: { error: message, code } };
}
function conflict(message: string, code: string): HttpResponse {
  return { status: 409, body: { error: message, code } };
}

export async function uploadFontHandler(
  req: HttpRequest<{ orgId: string }, Omit<UploadFontInput, 'orgId' | 'createdBy'> & { createdBy?: string }>,
  ctx: FontHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const record = await ctx.service.uploadFont({ ...rest, orgId: req.params.orgId, createdBy: actorId });
    ctx.metrics?.recordUpload();
    ctx.audit?.record({
      orgId: req.params.orgId,
      fontId: record.fontId,
      actorId,
      action: 'font.upload',
      payload: { kitId: record.kitId, format: record.format, weight: record.weight },
    });
    return created(record);
  } catch (e) {
    if (e instanceof FontValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    if (e instanceof FontLicenseBlockedError) {
      ctx.metrics?.recordLicenseBlock();
      return conflict(e.message, e.code);
    }
    throw e;
  }
}

export async function listFontsHandler(
  req: HttpRequest<{ orgId: string }, undefined, { kitId?: string }>,
  ctx: FontHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const kitId = req.query.kitId;
  if (!kitId) return badRequest('kitId query param is required', 'KIT_ID_REQUIRED');
  const fonts = await ctx.service.listFontsByKit(kitId, req.params.orgId);
  return ok({ fonts });
}

export async function getFontHandler(
  req: HttpRequest<{ orgId: string; fontId: string }, undefined>,
  ctx: FontHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const font = await ctx.service.getFont(req.params.fontId, req.params.orgId);
    return ok(font);
  } catch (e) {
    if (e instanceof FontNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function updateLicenseHandler(
  req: HttpRequest<{ orgId: string; fontId: string }, { licenseStatus?: FontLicenseStatus; licenseUrl?: string; licenseExpiresAt?: string | null }, { actorId?: string }>,
  ctx: FontHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  try {
    const updated = await ctx.service.updateLicense(req.params.fontId, req.params.orgId, {
      ...(req.body.licenseStatus !== undefined ? { licenseStatus: req.body.licenseStatus } : {}),
      ...(req.body.licenseUrl !== undefined ? { licenseUrl: req.body.licenseUrl } : {}),
      ...(req.body.licenseExpiresAt !== undefined
        ? { licenseExpiresAt: req.body.licenseExpiresAt ? new Date(req.body.licenseExpiresAt) : null }
        : {}),
    });
    ctx.audit?.record({
      orgId: req.params.orgId,
      fontId: req.params.fontId,
      actorId,
      action: 'font.license.update',
      payload: { licenseStatus: updated.licenseStatus },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof FontNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function deleteFontHandler(
  req: HttpRequest<{ orgId: string; fontId: string }, undefined, { actorId?: string }>,
  ctx: FontHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  try {
    await ctx.service.deleteFont(req.params.fontId, req.params.orgId);
    ctx.audit?.record({
      orgId: req.params.orgId,
      fontId: req.params.fontId,
      actorId,
      action: 'font.delete',
      payload: {},
    });
    return noContent();
  } catch (e) {
    if (e instanceof FontNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export const handlers = {
  uploadFont: uploadFontHandler,
  listFonts: listFontsHandler,
  getFont: getFontHandler,
  updateLicense: updateLicenseHandler,
  deleteFont: deleteFontHandler,
} as const;

// Re-export DL types for client-side convenience.
export type { FontFormat, FontLicenseStatus, FontAxes };