/**
 * Marketplace REST handlers (Phase 19 Wave 1).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints (16 operationIds):
 *   createMarketplaceListing
 *   listMarketplaceListings
 *   getMarketplaceListing
 *   updateMarketplaceListing
 *   submitMarketplaceListing        (202)
 *   publishMarketplaceListing
 *   deprecateMarketplaceListing
 *   addMarketplaceListingVersion
 *   getMarketplaceListingChangelog
 *   calculateMarketplacePrice
 *   getPayoutPolicy
 *   submitMarketplaceReview          (403 ERR_NOT_VERIFIED_BUYER)
 *   listMarketplaceReviews
 *   replyToMarketplaceReview         (409 ERR_ALREADY_REPLIED)
 *   reportMarketplaceReview          (202)
 *   getCuratedMarketplaceListings    (stub: returns [])
 */

import type { PricingModel } from './types.js';
import type { MarketplaceService } from './service.js';
import {
  ListingNotFoundError,
  ReviewNotFoundError,
  InvalidTransitionError,
  DuplicateCatalogIdError,
  NotVerifiedBuyerError,
  AlreadyRepliedError,
  FeatureDisabledError,
  MarketplaceValidationError,
} from './types.js';
import { StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';
import type { ChargebackEventType } from './types.js';
import type { PayoutMethodKind } from './creator/types.js';
import {
  OnboardingTransitionError,
  KycNotStartedError,
  KycInProgressError,
  PayoutNotReadyError,
} from './creator/types.js';
import type { BrandLockState } from './curated/types.js';
import {
  BrandLockDeniedError,
  InvalidBrandLockError,
  BrandLockNotFoundError,
} from './curated/types.js';
import type { TakedownKind } from './takedown/types.js';
import {
  InvalidTakedownTransitionError,
  TakedownNotFoundError,
  TrustScoreNotFoundError,
} from './takedown/types.js';

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
  readonly service: MarketplaceService;
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
function accepted<T>(body: T): HttpResponse {
  return { status: 202, body };
}
function problemDetail(title: string, status: number, detail: string, type?: string): HttpResponse {
  return {
    status,
    body: {
      type: type ?? 'about:blank',
      title,
      status,
      detail,
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
  if (e instanceof MarketplaceValidationError) {
    return problemDetail(e.message, 400, e.message, e.code);
  }
  if (e instanceof DuplicateCatalogIdError) {
    return problemDetail('Duplicate Catalog ID', 409, e.message);
  }
  if (e instanceof InvalidTransitionError) {
    return problemDetail('Invalid Transition', 409, e.message);
  }
  if (e instanceof ListingNotFoundError) {
    return problemDetail('Listing Not Found', 404, e.message);
  }
  if (e instanceof ReviewNotFoundError) {
    return problemDetail('Review Not Found', 404, e.message);
  }
  if (e instanceof NotVerifiedBuyerError) {
    return problemDetail('Not Verified Buyer', 403, e.message);
  }
  if (e instanceof AlreadyRepliedError) {
    return problemDetail('Already Replied', 409, e.message);
  }
  if (e instanceof FeatureDisabledError) {
    return problemDetail('Feature Disabled', 503, e.message);
  }
  if (e instanceof StoreNotConfiguredError) {
    return problemDetail('Store Not Configured', 503, e.message);
  }
  if (e instanceof StoreNotImplementedError) {
    return problemDetail('Store Not Implemented', 503, e.message);
  }
  if (e instanceof OnboardingTransitionError) {
    return problemDetail('Invalid Onboarding Transition', 409, e.message);
  }
  if (e instanceof KycNotStartedError) {
    return problemDetail('KYC Not Started', 400, e.message);
  }
  if (e instanceof KycInProgressError) {
    return problemDetail('KYC In Progress', 409, e.message);
  }
  if (e instanceof PayoutNotReadyError) {
    return problemDetail('Payout Not Ready', 400, e.message);
  }
  if (e instanceof BrandLockDeniedError) {
    return problemDetail('Brand-lock denies this listing', 403, e.message, 'brand_lock_denied');
  }
  if (e instanceof InvalidBrandLockError) {
    return problemDetail('Invalid Brand Lock', 400, e.message);
  }
  if (e instanceof BrandLockNotFoundError) {
    return problemDetail('Brand Lock Not Found', 404, e.message);
  }
  if (e instanceof InvalidTakedownTransitionError) {
    return problemDetail(
      'Invalid Takedown Transition',
      409,
      e.message,
      'invalid_takedown_transition',
    );
  }
  if (e instanceof TakedownNotFoundError) {
    return problemDetail('Takedown Not Found', 404, e.message);
  }
  if (e instanceof TrustScoreNotFoundError) {
    return problemDetail('Trust Score Not Found', 404, e.message);
  }
  if (e instanceof Error && e.message.includes('not found')) {
    return problemDetail('Not Found', 404, e.message);
  }
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings
// ---------------------------------------------------------------------------

export async function createMarketplaceListingHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      catalogId: string;
      sellerId: string;
      title: string;
      description?: string;
      tags?: string[];
      priceCents?: number;
      currency?: string;
      isFree?: boolean;
      preview?: Record<string, unknown>;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.createListing(req.body);
    return created({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/listings
// ---------------------------------------------------------------------------

export async function listMarketplaceListingsHandler(
  req: HttpRequest<
    Record<string, never>,
    undefined,
    {
      status?: string;
      sellerId?: string;
      limit?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const opts: { status?: string; sellerId?: string; limit?: number } = {};
    if (req.query.status) opts.status = req.query.status;
    if (req.query.sellerId) opts.sellerId = req.query.sellerId;
    if (req.query.limit) opts.limit = parseInt(req.query.limit, 10);
    const listings = await ctx.service.listListings(opts);
    return ok({ listings });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/listings/{listing_id}
// ---------------------------------------------------------------------------

export async function getMarketplaceListingHandler(
  req: HttpRequest<{ listing_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.getListing(req.params.listing_id);
    return ok({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/marketplace/listings/{listing_id}
// ---------------------------------------------------------------------------

export async function updateMarketplaceListingHandler(
  req: HttpRequest<
    { listing_id: string },
    {
      title?: string;
      description?: string;
      priceCents?: number;
      currency?: string;
      tags?: string[];
      preview?: Record<string, unknown>;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.updateListing(req.params.listing_id, req.body);
    return ok({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/{listing_id}/submit  (202)
// ---------------------------------------------------------------------------

export async function submitMarketplaceListingHandler(
  req: HttpRequest<{ listing_id: string }, Record<string, never>>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.submitListing(req.params.listing_id);
    return accepted({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/{listing_id}/publish
// ---------------------------------------------------------------------------

export async function publishMarketplaceListingHandler(
  req: HttpRequest<{ listing_id: string }, Record<string, never>>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.publishListing(req.params.listing_id);
    return ok({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/{listing_id}/deprecate
// ---------------------------------------------------------------------------

export async function deprecateMarketplaceListingHandler(
  req: HttpRequest<{ listing_id: string }, Record<string, never>>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listing = await ctx.service.deprecateListing(req.params.listing_id);
    return ok({ listing });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/{listing_id}/versions
// ---------------------------------------------------------------------------

export async function addMarketplaceListingVersionHandler(
  req: HttpRequest<
    { listing_id: string },
    {
      catalogId: string;
      version: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const version = await ctx.service.addListingVersion({
      listingId: req.params.listing_id,
      catalogId: req.body.catalogId,
      version: req.body.version,
    });
    return created({ version });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/listings/{listing_id}/changelog
// ---------------------------------------------------------------------------

export async function getMarketplaceListingChangelogHandler(
  req: HttpRequest<{ listing_id: string }, undefined, { catalogId?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const catalogId = req.query.catalogId ?? req.params.listing_id;
    const versions = await ctx.service.listListingVersions(catalogId);
    return ok({ versions });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/pricing/calculate
// ---------------------------------------------------------------------------

export async function calculateMarketplacePriceHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      priceCents: number;
      currency: string;
      model: PricingModel;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const breakdown = await ctx.service.calculatePrice(
      req.body.priceCents,
      req.body.currency,
      req.body.model,
    );
    return ok({ breakdown });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/payout-policy
// ---------------------------------------------------------------------------

export async function getPayoutPolicyHandler(
  _req: HttpRequest,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const policy = await ctx.service.getPayoutPolicy();
    return ok({ policy });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/{listing_id}/reviews
// ---------------------------------------------------------------------------

export async function submitMarketplaceReviewHandler(
  req: HttpRequest<
    { listing_id: string },
    {
      rating: number;
      body?: string;
      verifiedBuyer?: boolean;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const reviewBody: {
      listingId: string;
      reviewerId: string;
      rating: number;
      body?: string;
      verifiedBuyer?: boolean;
    } = {
      listingId: req.params.listing_id,
      reviewerId: actorId,
      rating: req.body.rating,
    };
    if (req.body.body !== undefined) reviewBody.body = req.body.body;
    if (req.body.verifiedBuyer !== undefined) reviewBody.verifiedBuyer = req.body.verifiedBuyer;
    const review = await ctx.service.submitReview(reviewBody);
    return created({ review });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/listings/{listing_id}/reviews
// ---------------------------------------------------------------------------

export async function listMarketplaceReviewsHandler(
  req: HttpRequest<{ listing_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const reviews = await ctx.service.listReviews(req.params.listing_id);
    return ok({ reviews });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/reviews/{review_id}/reply
// ---------------------------------------------------------------------------

export async function replyToMarketplaceReviewHandler(
  req: HttpRequest<{ review_id: string }, { replyBody: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const review = await ctx.service.replyToReview(req.params.review_id, req.body.replyBody);
    return ok({ review });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/reviews/{review_id}/report  (202)
// ---------------------------------------------------------------------------

export async function reportMarketplaceReviewHandler(
  req: HttpRequest<{ review_id: string }, Record<string, never>>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const review = await ctx.service.reportReview(req.params.review_id);
    return accepted({ review });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/listings/curated
// ---------------------------------------------------------------------------

export async function getCuratedMarketplaceListingsHandler(
  req: HttpRequest<Record<string, never>, undefined, { brand_kit_id?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const listings = await ctx.service.getCuratedListings(req.query.brand_kit_id);
    return ok({ listings });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/purchases  (201)
// ---------------------------------------------------------------------------

export async function createPurchaseHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      listing_id: string;
      provider: string;
      currency: string;
      idempotency_key: string;
      quantity?: number;
      success_url?: string;
      cancel_url?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const workspaceId = (req.headers['x-workspace-id'] as string) ?? '';
    const input: {
      listing_id: string;
      provider: string;
      currency: string;
      idempotency_key: string;
      quantity?: number;
      success_url?: string;
      cancel_url?: string;
    } = {
      listing_id: req.body.listing_id,
      provider: req.body.provider,
      currency: req.body.currency,
      idempotency_key: req.body.idempotency_key,
    };
    if (req.body.quantity !== undefined) input.quantity = req.body.quantity;
    if (req.body.success_url !== undefined) input.success_url = req.body.success_url;
    if (req.body.cancel_url !== undefined) input.cancel_url = req.body.cancel_url;
    const purchase = await ctx.service.createPurchase(workspaceId, actorId, input);
    return created({ purchase });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/refunds  (202)
// ---------------------------------------------------------------------------

export async function requestRefundHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      purchase_id: string;
      reason: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const workspaceId = (req.headers['x-workspace-id'] as string) ?? '';
    const refund = await ctx.service.requestRefund(
      workspaceId,
      actorId,
      req.body.purchase_id,
      req.body.reason,
    );
    return accepted({ refund });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/webhooks/stripe  (200)
// ---------------------------------------------------------------------------

export async function receiveStripeWebhookHandler(
  req: HttpRequest<Record<string, never>, Buffer | string>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const signature = req.headers['stripe-signature'] ?? '';
    const body = typeof req.body === 'string' ? req.body : req.body.toString();
    const payload = JSON.parse(body) as Record<string, unknown>;
    const eventType = (payload.type as string) ?? '';
    const result = await ctx.service.handlePaymentWebhook('stripe', req.body, signature, eventType);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/webhooks/bkash  (200)
// ---------------------------------------------------------------------------

export async function receiveBkashWebhookHandler(
  req: HttpRequest<Record<string, never>, Buffer | string>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const signature = req.headers['x-bkash-signature'] ?? '';
    const body = typeof req.body === 'string' ? req.body : req.body.toString();
    const payload = JSON.parse(body) as Record<string, unknown>;
    const eventType = (payload.type as string) ?? '';
    const result = await ctx.service.handlePaymentWebhook('bkash', req.body, signature, eventType);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/webhooks/nagad  (200)
// ---------------------------------------------------------------------------

export async function receiveNagadWebhookHandler(
  req: HttpRequest<Record<string, never>, Buffer | string>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const signature = req.headers['x-nagad-signature'] ?? '';
    const body = typeof req.body === 'string' ? req.body : req.body.toString();
    const payload = JSON.parse(body) as Record<string, unknown>;
    const eventType = (payload.type as string) ?? '';
    const result = await ctx.service.handlePaymentWebhook('nagad', req.body, signature, eventType);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/chargebacks  (200)
// ---------------------------------------------------------------------------

export async function handleChargebackHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      provider: string;
      event_type: ChargebackEventType;
      purchase_id: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    await ctx.service.handleChargeback(
      req.body.provider,
      req.body.event_type,
      req.body.purchase_id,
    );
    return ok({ received: true });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/creators/{user_id}/profile
// ---------------------------------------------------------------------------

export async function getCreatorProfileHandler(
  req: HttpRequest<{ user_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const profile = await ctx.service.getCreatorProfile(req.params.user_id);
    return ok({ profile });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/marketplace/creators/{user_id}/profile
// ---------------------------------------------------------------------------

export async function updateCreatorProfileHandler(
  req: HttpRequest<
    { user_id: string },
    {
      displayName?: string;
      slug?: string;
      bio?: string;
      countryCode?: string;
      payoutMethod?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const profile = await ctx.service.updateCreatorProfile(req.params.user_id, req.body);
    return ok({ profile });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/creators/{user_id}/kyc/start  (200)
// ---------------------------------------------------------------------------

export async function startKycSessionHandler(
  req: HttpRequest<{ user_id: string }, { country_code: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const session = await ctx.service.startKycSession(req.params.user_id, req.body.country_code);
    return ok({ session });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/creators/{user_id}/kyc/status  (200)
// ---------------------------------------------------------------------------

export async function getKycStatusHandler(
  req: HttpRequest<{ user_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const result = await ctx.service.getKycStatus(req.params.user_id);
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/creators/{user_id}/payout-methods  (201)
// ---------------------------------------------------------------------------

export async function createCreatorPayoutMethodHandler(
  req: HttpRequest<
    { user_id: string },
    {
      kind: string;
      external_account_id: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const method = await ctx.service.createPayoutMethod(
      req.params.user_id,
      req.body.kind,
      req.body.external_account_id,
    );
    return created({ method });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/creators/{user_id}/payout-methods  (200)
// ---------------------------------------------------------------------------

export async function listCreatorPayoutMethodsHandler(
  req: HttpRequest<{ user_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const methods = await ctx.service.listPayoutMethods(req.params.user_id);
    return ok({ methods });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/creators/{user_id}/payout/connect-link  (200)
// ---------------------------------------------------------------------------

export async function getPayoutConnectLinkHandler(
  req: HttpRequest<{ user_id: string }, { kind: PayoutMethodKind }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const link = await ctx.service.getPayoutConnectLink(req.params.user_id, req.body.kind);
    return ok({ link });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/brand-locks  (201)
// ---------------------------------------------------------------------------

export async function createBrandLockHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      workspace_id: string;
      brand_kit_id: string;
      marketplace_listing_id: string;
      state: BrandLockState;
      override_price_cents?: number | null;
      notes?: string | null;
      audit_actor_id?: string | null;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const lock = await ctx.service.createBrandLock({
      workspaceId: req.body.workspace_id,
      brandKitId: req.body.brand_kit_id,
      marketplaceListingId: req.body.marketplace_listing_id,
      state: req.body.state,
      overridePriceCents: req.body.override_price_cents ?? null,
      notes: req.body.notes ?? null,
      auditActorId: req.body.audit_actor_id ?? null,
    });
    return created({ lock });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/brand-locks  (200)
// ---------------------------------------------------------------------------

export async function listBrandLocksHandler(
  req: HttpRequest<
    Record<string, never>,
    undefined,
    {
      workspace_id: string;
      brand_kit_id: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const locks = await ctx.service.listBrandLocks(
      req.query.workspace_id ?? '',
      req.query.brand_kit_id ?? '',
    );
    return ok({ locks });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/brand-locks/{lock_id}  (200)
// ---------------------------------------------------------------------------

export async function getBrandLockHandler(
  req: HttpRequest<
    { lock_id: string },
    undefined,
    {
      workspace_id: string;
      brand_kit_id: string;
      marketplace_listing_id: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const lock = await ctx.service.getBrandLock(
      req.query.workspace_id ?? '',
      req.query.brand_kit_id ?? '',
      req.query.marketplace_listing_id ?? '',
    );
    return ok({ lock });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/marketplace/brand-locks/{lock_id}  (200)
// ---------------------------------------------------------------------------

export async function updateBrandLockHandler(
  req: HttpRequest<
    { lock_id: string },
    {
      state?: BrandLockState;
      override_price_cents?: number | null;
      notes?: string | null;
      audit_actor_id?: string | null;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const patch: Record<string, unknown> = {};
    if (req.body.state !== undefined) patch.state = req.body.state;
    if (req.body.override_price_cents !== undefined)
      patch.overridePriceCents = req.body.override_price_cents;
    if (req.body.notes !== undefined) patch.notes = req.body.notes;
    if (req.body.audit_actor_id !== undefined) patch.auditActorId = req.body.audit_actor_id;
    const lock = await ctx.service.updateBrandLock(
      req.params.lock_id,
      patch as Parameters<MarketplaceService['updateBrandLock']>[1],
    );
    return ok({ lock });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/marketplace/brand-locks/{brand_lock_id}  (204)
// ---------------------------------------------------------------------------

export async function deleteBrandLockHandler(
  req: HttpRequest<{ brand_lock_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    await ctx.service.deleteBrandLock(req.params.brand_lock_id);
    return noContent();
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/takedowns  (201)
// ---------------------------------------------------------------------------

export async function fileTakedownHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      workspace_id: string;
      listing_id: string;
      claimant_id: string;
      kind: TakedownKind;
      evidence_url?: string | null;
      statement: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.fileTakedown({
      workspaceId: req.body.workspace_id,
      listingId: req.body.listing_id,
      claimantId: req.body.claimant_id,
      kind: req.body.kind,
      evidenceUrl: req.body.evidence_url ?? undefined,
      statement: req.body.statement,
    });
    return created({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/takedowns/{request_id}  (200)
// ---------------------------------------------------------------------------

export async function getTakedownRequestHandler(
  req: HttpRequest<{ request_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.getTakedownRequest(req.params.request_id);
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/takedowns  (200)
// ---------------------------------------------------------------------------

export async function listTakedownRequestsHandler(
  req: HttpRequest<
    Record<string, never>,
    undefined,
    {
      status?: string;
      kind?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const opts: { status?: string; kind?: string } = {};
    if (req.query.status) opts.status = req.query.status;
    if (req.query.kind) opts.kind = req.query.kind;
    const requests = await ctx.service.listTakedownRequests(
      opts as Parameters<MarketplaceService['listTakedownRequests']>[0],
    );
    return ok({ requests });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/takedowns/{request_id}/review  (200)
// ---------------------------------------------------------------------------

export async function reviewTakedownHandler(
  req: HttpRequest<{ request_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.reviewTakedown(req.params.request_id);
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/takedowns/{request_id}/confirm  (200)
// ---------------------------------------------------------------------------

export async function confirmTakedownHandler(
  req: HttpRequest<{ request_id: string }, { resolution_notes?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.confirmTakedown(
      req.params.request_id,
      req.body.resolution_notes,
    );
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/takedowns/{request_id}/dismiss  (200)
// ---------------------------------------------------------------------------

export async function dismissTakedownHandler(
  req: HttpRequest<{ request_id: string }, { resolution_notes?: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.dismissTakedown(
      req.params.request_id,
      req.body.resolution_notes,
    );
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/takedowns/{request_id}/counter-notice  (200)
// ---------------------------------------------------------------------------

export async function submitCounterNoticeHandler(
  req: HttpRequest<{ request_id: string }, { statement: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const request = await ctx.service.counterNoticeTakedown(req.params.request_id);
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/takedowns/{request_id}/resolve  (200)
// ---------------------------------------------------------------------------

export async function resolveTakedownRequestHandler(
  req: HttpRequest<
    { request_id: string },
    { decision: 'confirmed' | 'dismissed'; resolution_notes?: string }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    let request;
    if (req.body.decision === 'confirmed') {
      request = await ctx.service.confirmTakedown(req.params.request_id, req.body.resolution_notes);
    } else {
      request = await ctx.service.dismissTakedown(req.params.request_id, req.body.resolution_notes);
    }
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/marketplace/trust-scores  (200)
// ---------------------------------------------------------------------------

export async function computeTrustScoreHandler(
  req: HttpRequest<
    Record<string, never>,
    {
      listing_id: string;
      signals: Record<string, unknown>;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const score = await ctx.service.computeAndStoreTrustScore(
      req.body.listing_id,
      req.body.signals,
    );
    return ok({ score });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/marketplace/trust-scores/{listing_id}  (200)
// ---------------------------------------------------------------------------

export async function getTrustScoreHandler(
  req: HttpRequest<{ listing_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const score = await ctx.service.getTrustScore(req.params.listing_id);
    return ok({ score });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/fx/rates  (200)
// ---------------------------------------------------------------------------

export async function getFxRateHandler(
  req: HttpRequest<
    Record<string, never>,
    undefined,
    {
      base?: string;
      quote?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    if (!req.query.base || !req.query.quote) {
      return problemDetail(
        'Missing Required Parameters',
        400,
        'base and quote query parameters are required',
      );
    }
    const rate = await ctx.service.getFxRate(req.query.base, req.query.quote);
    return ok({ rate });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/payouts  (200)
// ---------------------------------------------------------------------------

export async function listPayoutRunsHandler(
  req: HttpRequest<
    Record<string, never>,
    undefined,
    {
      period_month?: string;
    }
  >,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const opts: { periodMonth?: string } = {};
    if (req.query.period_month) opts.periodMonth = req.query.period_month;
    const runs = await ctx.service.listPayoutRuns(opts);
    return ok({ runs });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/payouts/{run_id}  (200)
// ---------------------------------------------------------------------------

export async function getPayoutRunHandler(
  req: HttpRequest<{ run_id: string }>,
  ctx: MarketplaceHandlerContext,
): Promise<HttpResponse> {
  try {
    const run = await ctx.service.getPayoutRun(req.params.run_id);
    return ok({ run });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createMarketplaceListing: createMarketplaceListingHandler,
  listMarketplaceListings: listMarketplaceListingsHandler,
  getMarketplaceListing: getMarketplaceListingHandler,
  updateMarketplaceListing: updateMarketplaceListingHandler,
  submitMarketplaceListing: submitMarketplaceListingHandler,
  publishMarketplaceListing: publishMarketplaceListingHandler,
  deprecateMarketplaceListing: deprecateMarketplaceListingHandler,
  addMarketplaceListingVersion: addMarketplaceListingVersionHandler,
  getMarketplaceListingChangelog: getMarketplaceListingChangelogHandler,
  calculateMarketplacePrice: calculateMarketplacePriceHandler,
  getPayoutPolicy: getPayoutPolicyHandler,
  submitMarketplaceReview: submitMarketplaceReviewHandler,
  listMarketplaceReviews: listMarketplaceReviewsHandler,
  replyToMarketplaceReview: replyToMarketplaceReviewHandler,
  reportMarketplaceReview: reportMarketplaceReviewHandler,
  getCuratedMarketplaceListings: getCuratedMarketplaceListingsHandler,
  createPurchase: createPurchaseHandler,
  requestRefund: requestRefundHandler,
  receiveStripeWebhook: receiveStripeWebhookHandler,
  receiveBkashWebhook: receiveBkashWebhookHandler,
  receiveNagadWebhook: receiveNagadWebhookHandler,
  handleChargeback: handleChargebackHandler,
  getCreatorProfile: getCreatorProfileHandler,
  updateCreatorProfile: updateCreatorProfileHandler,
  startKycSession: startKycSessionHandler,
  getKycStatus: getKycStatusHandler,
  createCreatorPayoutMethod: createCreatorPayoutMethodHandler,
  listCreatorPayoutMethods: listCreatorPayoutMethodsHandler,
  getPayoutConnectLink: getPayoutConnectLinkHandler,
  createBrandLock: createBrandLockHandler,
  listBrandLocks: listBrandLocksHandler,
  getBrandLock: getBrandLockHandler,
  updateBrandLock: updateBrandLockHandler,
  deleteBrandLock: deleteBrandLockHandler,
  fileTakedown: fileTakedownHandler,
  getTakedownRequest: getTakedownRequestHandler,
  listTakedownRequests: listTakedownRequestsHandler,
  reviewTakedown: reviewTakedownHandler,
  confirmTakedown: confirmTakedownHandler,
  dismissTakedown: dismissTakedownHandler,
  submitCounterNotice: submitCounterNoticeHandler,
  resolveTakedownRequest: resolveTakedownRequestHandler,
  computeTrustScore: computeTrustScoreHandler,
  getTrustScore: getTrustScoreHandler,
  getFxRate: getFxRateHandler,
  listPayoutRuns: listPayoutRunsHandler,
  getPayoutRun: getPayoutRunHandler,
} as const;
