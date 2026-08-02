/**
 * Marketplace preview — REST handlers (Phase 07 #45).
 *
 * Endpoints:
 *
 *   POST   /v1/marketplace/listings           createListing
 *   GET    /v1/marketplace/listings           listListings
 *   GET    /v1/marketplace/listings/:id       getListing
 *   PUT    /v1/marketplace/listings/:id       updateListing
 *   POST   /v1/marketplace/listings/:id/publish    publishListing
 *   POST   /v1/marketplace/listings/:id/archive    archiveListing
 *   POST   /v1/marketplace/listings/:id/certify    certifyA11y
 *   POST   /v1/marketplace/listings/:id/feature    setFeatured
 *   POST   /v1/marketplace/installs           installTheme
 *   GET    /v1/marketplace/installs           listInstalls
 *   POST   /v1/marketplace/reviews            addReview
 *   GET    /v1/marketplace/reviews/:listingId listReviews
 */

import {
  MarketplacePreviewService,
  type AddReviewInput,
  type CreateListingInput,
  type InstallThemeInput,
  type UpdateListingInput,
  ListingNotFoundError,
  ListingValidationError,
  ContentHashMismatchError,
  RestrictedLicenseError,
  A11yCertificationRequiredError,
} from './service.js';
import type { MarketplaceMetrics } from './metrics.js';
import type { MarketplaceAuditRecorder } from './audit.js';

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

export interface MarketplaceHandlerContext {
  readonly service: MarketplacePreviewService;
  readonly metrics?: MarketplaceMetrics;
  readonly audit?: MarketplaceAuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: {
    actorId: string | undefined;
    action: 'read' | 'write-listing' | 'install' | 'moderate';
  }) => void;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse { return { status: 200, body }; }
function created<T>(body: T): HttpResponse { return { status: 201, body }; }
function badRequest(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 400, body: { error: message, code, ...(extra ?? {}) } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function forbidden(message: string, code: string): HttpResponse {
  return { status: 403, body: { error: message, code } };
}
function notFound(message: string, code: string): HttpResponse {
  return { status: 404, body: { error: message, code } };
}
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}

// ---------------------------------------------------------------------------
// Listing handlers
// ---------------------------------------------------------------------------

export async function createListingHandler(
  req: HttpRequest<unknown, Omit<CreateListingInput, 'createdBy'> & { createdBy?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-listing' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const listing = await ctx.service.createListing({ ...rest, createdBy: actorId });
    ctx.metrics?.recordListingCreate();
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.create',
      payload: { name: listing.name, contentHash: listing.contentHash },
    });
    return created(listing);
  } catch (e) {
    if (e instanceof ListingValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function listListingsHandler(
  req: HttpRequest<unknown, undefined, { status?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const listings = await ctx.service.listListings(req.query.status as never);
  return ok({ listings });
}

export async function getListingHandler(
  req: HttpRequest<{ listingId: string }, undefined>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const listing = await ctx.service.getListing(req.params.listingId);
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function updateListingHandler(
  req: HttpRequest<{ listingId: string }, UpdateListingInput>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-listing' });
  try {
    const listing = await ctx.service.updateListing(req.params.listingId, req.body);
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.update',
      payload: { fields: Object.keys(req.body) },
    });
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    if (e instanceof ListingValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function publishListingHandler(
  req: HttpRequest<{ listingId: string }, undefined, { actorId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-listing' });
  try {
    const listing = await ctx.service.publishListing(req.params.listingId);
    ctx.metrics?.recordListingPublish();
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.publish',
      payload: {},
    });
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    if (e instanceof ListingValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function archiveListingHandler(
  req: HttpRequest<{ listingId: string }, undefined, { actorId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-listing' });
  try {
    const listing = await ctx.service.archiveListing(req.params.listingId);
    ctx.metrics?.recordListingArchive();
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.archive',
      payload: {},
    });
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function certifyA11yHandler(
  req: HttpRequest<{ listingId: string }, { passed: boolean }, { actorId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'moderate' });
  try {
    const listing = await ctx.service.certifyA11y(req.params.listingId, req.body.passed);
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.certifyA11y',
      payload: { passed: req.body.passed },
    });
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}

export async function setFeaturedHandler(
  req: HttpRequest<{ listingId: string }, { featured: boolean }, { actorId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'moderate' });
  try {
    const listing = await ctx.service.setFeatured(req.params.listingId, req.body.featured);
    ctx.audit?.record({
      orgId: listing.sellerOrgId,
      listingId: listing.listingId,
      actorId,
      action: 'marketplace.listing.feature',
      payload: { featured: req.body.featured },
    });
    return ok(listing);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    if (e instanceof A11yCertificationRequiredError) return conflict(e.message, e.code);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Install handler
// ---------------------------------------------------------------------------

export async function installThemeHandler(
  req: HttpRequest<unknown, Omit<InstallThemeInput, 'installedBy' | 'isAdmin'> & { installedBy?: string; isAdmin?: boolean }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.installedBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'install' });
  const { installedBy: _ignored, isAdmin: bodyAdmin, ...rest } = req.body;
  void _ignored;
  const isAdmin = Boolean(bodyAdmin ?? ctx.resolveActorId?.(req));
  try {
    const install = await ctx.service.installTheme({
      ...rest,
      installedBy: actorId,
      isAdmin,
    });
    ctx.metrics?.recordInstall();
    ctx.audit?.record({
      orgId: install.installerOrgId,
      listingId: install.listingId,
      installId: install.installId,
      actorId,
      action: 'marketplace.install',
      payload: {
        brandKitDraftId: install.brandKitDraftId,
        verifiedContentHash: install.verifiedContentHash,
        adminOverride: install.adminOverride,
      },
    });
    return created(install);
  } catch (e) {
    ctx.metrics?.recordInstallRejected();
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    if (e instanceof ListingValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    if (e instanceof ContentHashMismatchError) {
      return conflict(e.message, e.code, { expected: e.expected, actual: e.actual });
    }
    if (e instanceof RestrictedLicenseError) {
      return forbidden(e.message, e.code);
    }
    throw e;
  }
}

export async function listInstallsHandler(
  req: HttpRequest<unknown, undefined, { orgId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const orgId = req.query.orgId;
  if (!orgId) return badRequest('Missing orgId query parameter', 'BAD_REQUEST');
  const installs = await ctx.service.listInstalls(orgId);
  return ok({ installs });
}

// ---------------------------------------------------------------------------
// Review handler
// ---------------------------------------------------------------------------

export async function addReviewHandler(
  req: HttpRequest<unknown, Omit<AddReviewInput, 'createdBy'> & { createdBy?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'install' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const review = await ctx.service.addReview({ ...rest, createdBy: actorId });
    ctx.metrics?.recordReview();
    return created(review);
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    if (e instanceof ListingValidationError) return badRequest(e.message, e.code, { issues: e.issues });
    throw e;
  }
}

export async function listReviewsHandler(
  req: HttpRequest<{ listingId: string }, undefined>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const reviews = await ctx.service.listReviews(req.params.listingId);
    return ok({ reviews });
  } catch (e) {
    if (e instanceof ListingNotFoundError) return notFound(e.message, e.code);
    throw e;
  }
}