/**
 * Brand service — REST handlers (Phase 07 A.3).
 *
 * Web-framework-free handler functions that the Hono / Express /
 * Node http server can mount.  Mirrors the
 * `services/control-plane/src/branch/handlers.ts` pattern.
 *
 * Endpoints:
 *
 *   POST   /v1/brands                  createBrandKit
 *   GET    /v1/brands                  listBrandKits (?status=)
 *   GET    /v1/brands/:kitId           getBrandKit
 *   PUT    /v1/brands/:kitId           updateBrandKit
 *   POST   /v1/brands/:kitId/publish   publishBrandKit
 *   POST   /v1/brands/:kitId/unpublish unpublishBrandKit
 *   POST   /v1/brands/:kitId/archive   archiveBrandKit
 *   POST   /v1/brands/:kitId/attest    attestExtraction
 *   POST   /v1/brands/sub-brands       addSubBrand
 *   GET    /v1/brands/:kitId/relations (children + parents)
 *   POST   /v1/brands/contexts         createBrandContext
 *   GET    /v1/brands/contexts         listBrandContexts
 *   GET    /v1/brands/contexts/:id     getBrandContext
 *   POST   /v1/brands/contexts/:id/active   setActiveBrandKit
 *   POST   /v1/brands/contexts/:id/archive archiveBrandContext
 *   POST   /v1/brands/extraction       startExtraction
 *   GET    /v1/brands/extraction/:id   getExtractionJob
 *   PATCH  /v1/brands/extraction/:id   updateExtractionJob (worker)
 */

import type {
  BrandKitLogoRecord,
  BrandKitPaletteRecord,
  BrandKitFontRecord,
  BrandKitImageryRuleRecord,
  BrandKitRecord,
} from './dal.js';
import {
  BrandService,
  type CreateBrandKitInput,
  type UpdateBrandKitInput,
  type CreateBrandContextInput,
  type StartExtractionInput,
  type ExtractionProgressUpdate,
  BrandKitNotFoundError,
  BrandKitValidationError,
  BrandKitImmutableError,
  SubBrandCycleError,
  SubBrandDuplicateError,
  BrandContextNotFoundError,
  ExtactionJobNotFoundError,
} from './service.js';
import type { BrandMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';

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

export interface BrandHandlerContext {
  readonly service: BrandService;
  readonly metrics?: BrandMetrics;
  readonly audit?: AuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: {
    actorId: string | undefined;
    action: 'read' | 'write-kit' | 'write-context' | 'write-extraction';
  }) => void;
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
function accepted<T>(body: T): HttpResponse {
  return { status: 202, body };
}
function noContent(): HttpResponse {
  return { status: 204, body: null };
}
function badRequest(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 400, body: { error: message, code, ...(extra ?? {}) } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function notFound(message: string, code: string): HttpResponse {
  return { status: 404, body: { error: message, code } };
}
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}

// ---------------------------------------------------------------------------
// Brand-kit endpoints
// ---------------------------------------------------------------------------

export async function createBrandKitHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<CreateBrandKitInput, 'orgId' | 'createdBy'> & { createdBy?: string }
  >,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const record = await ctx.service.createBrandKit({
      ...rest,
      orgId: req.params.orgId,
      createdBy: actorId,
    });
    ctx.metrics?.recordKitCreate();
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: record.kitId,
      actorId,
      action: 'brand.kit.create',
      payload: { name: record.name, scope: record.scope },
    });
    return created(record);
  } catch (e) {
    if (e instanceof BrandKitValidationError)
      return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function listBrandKitsHandler(
  req: HttpRequest<{ orgId: string }, undefined, { status?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const kits = await ctx.service.listBrandKits(req.params.orgId, req.query.status as never);
  return ok({ brandKits: kits });
}

export async function getBrandKitHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, undefined>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const kit = await ctx.service.getBrandKit(req.params.kitId, req.params.orgId);
    return ok(kit);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function updateBrandKitHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, UpdateBrandKitInput>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.updatedBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const updated = await ctx.service.updateBrandKit(req.params.kitId, req.params.orgId, req.body);
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: req.params.kitId,
      actorId,
      action: 'brand.kit.update',
      payload: { fields: Object.keys(req.body).filter((k) => k !== 'updatedBy') },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    if (e instanceof BrandKitImmutableError) return conflict(e.message, e.code);
    if (e instanceof BrandKitValidationError)
      return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function publishBrandKitHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, undefined, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const kit = await ctx.service.publishBrandKit(req.params.kitId, req.params.orgId, actorId);
    ctx.metrics?.recordKitPublish();
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: req.params.kitId,
      actorId,
      action: 'brand.kit.publish',
      payload: {},
    });
    return ok(kit);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    if (e instanceof BrandKitValidationError)
      return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function unpublishBrandKitHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, undefined, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const kit = await ctx.service.unpublishBrandKit(req.params.kitId, req.params.orgId, actorId);
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: req.params.kitId,
      actorId,
      action: 'brand.kit.unpublish',
      payload: {},
    });
    return ok(kit);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function archiveBrandKitHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, { reason?: string }, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body
    ? (req.query.actorId ?? ctx.resolveActorId?.(req))
    : ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const kit = await ctx.service.archiveBrandKit(
      req.params.kitId,
      req.params.orgId,
      req.body?.reason ?? 'archived',
      actorId,
    );
    ctx.metrics?.recordKitArchive();
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: req.params.kitId,
      actorId,
      action: 'brand.kit.archive',
      payload: { reason: req.body?.reason ?? 'archived' },
    });
    return ok(kit);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function attestExtractionHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, undefined, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const kit = await ctx.service.attestExtraction(req.params.kitId, req.params.orgId, actorId);
    ctx.audit?.record({
      orgId: req.params.orgId,
      kitId: req.params.kitId,
      actorId,
      action: 'brand.kit.attest',
      payload: { extractionAttestationId: kit.extractionAttestationId },
    });
    return ok(kit);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Sub-brand endpoints
// ---------------------------------------------------------------------------

export async function addSubBrandHandler(
  req: HttpRequest<
    { orgId: string },
    { parentKitId: string; childKitId: string; inheritanceType: 'extend' | 'override' },
    { actorId?: string }
  >,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-kit' });
  try {
    const record = await ctx.service.addSubBrand({ ...req.body, orgId: req.params.orgId });
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'brand.subbrand.add',
      payload: {
        parentKitId: record.parentKitId,
        childKitId: record.childKitId,
        inheritanceType: record.inheritanceType,
      },
    });
    return created(record);
  } catch (e) {
    if (e instanceof SubBrandCycleError) {
      ctx.metrics?.recordSubBrandCycle();
      return conflict(e.message, e.code, { cycle: e.cycle });
    }
    if (e instanceof SubBrandDuplicateError) return conflict(e.message, e.code);
    throw e;
  }
}

export async function listSubBrandsHandler(
  req: HttpRequest<{ orgId: string; kitId: string }, undefined>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const relations = await ctx.service.listSubBrands(req.params.kitId, req.params.orgId);
  return ok(relations);
}

// ---------------------------------------------------------------------------
// Brand-context endpoints
// ---------------------------------------------------------------------------

export async function createBrandContextHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<CreateBrandContextInput, 'orgId' | 'createdBy'> & { createdBy?: string }
  >,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-context' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  const ctx2 = await ctx.service.createBrandContext({
    ...rest,
    orgId: req.params.orgId,
    createdBy: actorId,
  });
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'brand.context.create',
    payload: { contextId: ctx2.contextId, name: ctx2.name },
  });
  return created(ctx2);
}

export async function listBrandContextsHandler(
  req: HttpRequest<{ orgId: string }, undefined>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const list = await ctx.service.listBrandContexts(req.params.orgId);
  return ok({ contexts: list });
}

export async function getBrandContextHandler(
  req: HttpRequest<{ orgId: string; contextId: string }, undefined>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const c = await ctx.service.getBrandContext(req.params.contextId, req.params.orgId);
    return ok(c);
  } catch (e) {
    if (e instanceof BrandContextNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function setActiveBrandKitHandler(
  req: HttpRequest<{ orgId: string; contextId: string }, { kitId: string }, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-context' });
  try {
    const updated = await ctx.service.setActiveBrandKit(
      req.params.contextId,
      req.params.orgId,
      req.body.kitId,
      actorId,
    );
    ctx.metrics?.recordContextSwitch();
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'brand.context.setActive',
      payload: { contextId: req.params.contextId, kitId: req.body.kitId },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof BrandKitNotFoundError) return notFound(e.message, e.code);
    if (e instanceof BrandContextNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function archiveBrandContextHandler(
  req: HttpRequest<{ orgId: string; contextId: string }, undefined, { actorId?: string }>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-context' });
  await ctx.service.archiveBrandContext(req.params.contextId, req.params.orgId, actorId);
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'brand.context.archive',
    payload: { contextId: req.params.contextId },
  });
  return noContent();
}

// ---------------------------------------------------------------------------
// Extraction endpoints
// ---------------------------------------------------------------------------

export async function startExtractionHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<StartExtractionInput, 'orgId' | 'createdBy'> & { createdBy?: string }
  >,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-extraction' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  const job = await ctx.service.startExtraction({
    ...rest,
    orgId: req.params.orgId,
    createdBy: actorId,
  });
  ctx.metrics?.recordExtractionStart();
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'brand.extraction.start',
    payload: { jobId: job.jobId, url: job.url },
  });
  return accepted(job);
}

export async function getExtractionHandler(
  req: HttpRequest<{ orgId: string; jobId: string }, undefined>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const job = await ctx.service.getExtractionJob(req.params.jobId);
    if (job.orgId !== req.params.orgId) {
      return notFound(
        `Extraction job ${req.params.jobId} not found`,
        'BRAND_EXTRACTION_JOB_NOT_FOUND',
      );
    }
    return ok(job);
  } catch (e) {
    if (e instanceof ExtactionJobNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function updateExtractionHandler(
  req: HttpRequest<{ orgId: string; jobId: string }, ExtractionProgressUpdate>,
  ctx: BrandHandlerContext,
): Promise<HttpResponse> {
  // Worker endpoint — actor still required for audit.
  const actorId = ctx.resolveActorId?.(req) ?? 'system:brand-extract-worker';
  ctx.authorize?.({ actorId, action: 'write-extraction' });
  try {
    const job = await ctx.service.updateExtractionJob(req.params.jobId, req.body);
    if (job.orgId !== req.params.orgId) {
      return notFound(
        `Extraction job ${req.params.jobId} not found`,
        'BRAND_EXTRACTION_JOB_NOT_FOUND',
      );
    }
    if (job.status === 'completed' || job.status === 'failed') {
      ctx.metrics?.recordExtractionLatency(job.updatedAt.getTime() - job.createdAt.getTime());
    }
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: `brand.extraction.${job.status}`,
      payload: { jobId: job.jobId, stages: job.stages },
    });
    return ok(job);
  } catch (e) {
    if (e instanceof ExtactionJobNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Aggregate handlers table
// ---------------------------------------------------------------------------

export const handlers = {
  createBrandKit: createBrandKitHandler,
  listBrandKits: listBrandKitsHandler,
  getBrandKit: getBrandKitHandler,
  updateBrandKit: updateBrandKitHandler,
  publishBrandKit: publishBrandKitHandler,
  unpublishBrandKit: unpublishBrandKitHandler,
  archiveBrandKit: archiveBrandKitHandler,
  attestExtraction: attestExtractionHandler,
  addSubBrand: addSubBrandHandler,
  listSubBrands: listSubBrandsHandler,
  createBrandContext: createBrandContextHandler,
  listBrandContexts: listBrandContextsHandler,
  getBrandContext: getBrandContextHandler,
  setActiveBrandKit: setActiveBrandKitHandler,
  archiveBrandContext: archiveBrandContextHandler,
  startExtraction: startExtractionHandler,
  getExtraction: getExtractionHandler,
  updateExtraction: updateExtractionHandler,
} as const;

// Convenience re-export to keep the @domio/schema-free shape working.
export type BrandKitLogoInput = BrandKitLogoRecord;
export type BrandKitPaletteInput = BrandKitPaletteRecord;
export type BrandKitFontInput = BrandKitFontRecord;
export type BrandKitImageryRuleInput = BrandKitImageryRuleRecord;
export type BrandKit = BrandKitRecord;
