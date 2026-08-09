/**
 * Marketplace service (Phase 19 Wave 1).
 *
 * Transport-agnostic orchestration of listings, reviews, pricing,
 * payout policy, and curated listings.
 * Depends on:
 *  - {@link MarketplaceStore}       — persistence.
 *  - {@link MarketplaceEventEmitter} — event emission (default: noopEmitter).
 */

import { randomUUID } from 'crypto';
import {
  LISTING_TRANSITIONS,
  type MarketplaceListing,
  type MarketplaceReview,
  type PayoutPolicy,
  type ListingVersion,
  type PricingModel,
  type MarketplaceEventEmitter,
  type PaymentIntent,
  type PurchaseInitiation,
  type RefundRequest,
  type UsageProvider,
  defaultUsageProvider,
  type ChargebackEventType,
  type PayoutRun,
} from './types.js';
import {
  ListingNotFoundError,
  ReviewNotFoundError,
  InvalidTransitionError,
  DuplicateCatalogIdError,
  NotVerifiedBuyerError,
  AlreadyRepliedError,
  MarketplaceValidationError,
} from './types.js';
import { noopEmitter } from './types.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import { calculatePrice, normalizeCurrency } from './pricing.js';
import { InMemoryAuditRecorder, type AuditRecorder } from './audit.js';
import type { MarketplaceStore } from './store/store.js';
import type { PaymentProvider, CreateCheckoutInput } from './payments/types.js';
import { StripeSandboxProvider, BkashSandboxProvider, NagadSandboxProvider } from './payments/providers.js';
import type { LicenseSigner } from './license.js';
import { SandboxLicenseSigner } from './license.js';
import type {
  CreatorProfile,
  KycSession,
  CreatorPayoutMethod,
  OnboardingState,
  KycProvider,
  PayoutConnectProvider,
  PayoutMethodKind,
} from './creator/types.js';
import {
  OnboardingTransitionError,
  KycInProgressError,
} from './creator/types.js';
import { SandboxKycProvider, SandboxPayoutConnectProvider } from './creator/providers.js';
import { validateTransition } from './creator/onboarding.js';
import { startKycSessionBody } from './creator/kyc.js';
import { createPayoutMethodBody, connectLinkBody } from './creator/payout.js';
import type {
  BrandLockedListing,
  BrandLockState,
} from './curated/types.js';
import {
  InvalidBrandLockError,
  BrandLockNotFoundError,
} from './curated/types.js';
import { validateBrandLockInput, assertNotDenied } from './curated/logic.js';
import type {
  TakedownRequest,
  TakedownKind,
  TrustScore,
} from './takedown/types.js';
import {
  TakedownNotFoundError,
} from './takedown/types.js';
import {
  validateTakedownInput,
  validateTakedownTransition,
  fileTakedownBody,
  resolveBody as takedownResolveBody,
  dismissBody as takedownDismissBody,
  counterNoticeBody,
  computeTrustScore,
} from './takedown/logic.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MarketplaceServiceOptions {
  readonly store: MarketplaceStore;
  readonly eventEmitter?: MarketplaceEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
  /** Payment providers. Default: sandbox providers. */
  readonly paymentProviders?: Record<string, PaymentProvider>;
  /** License signer. Default: SandboxLicenseSigner. */
  readonly licenseSigner?: LicenseSigner;
  /** Usage provider. Default: returns 0 (Wave-2 stub). */
  readonly usageProvider?: UsageProvider;
  /** Audit recorder. Default: InMemoryAuditRecorder. */
  readonly auditRecorder?: AuditRecorder;
  /** KYC provider. Default: SandboxKycProvider. */
  readonly kycProvider?: KycProvider;
  /** Payout connect provider. Default: SandboxPayoutConnectProvider. */
  readonly payoutConnectProvider?: PayoutConnectProvider;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MarketplaceService {
  private readonly store: MarketplaceStore;
  private readonly emitter: MarketplaceEventEmitter;
  private readonly clock: () => Date;
  private readonly paymentProviders: Record<string, PaymentProvider>;
  private readonly licenseSigner: LicenseSigner;
  private readonly usageProvider: UsageProvider;
  private readonly auditRecorder: AuditRecorder;
  private readonly kycProvider: KycProvider;
  private readonly payoutConnectProvider: PayoutConnectProvider;

  constructor(opts: MarketplaceServiceOptions) {
    if (!opts.store) throw new Error('MarketplaceService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
    this.paymentProviders = opts.paymentProviders ?? {
      stripe: new StripeSandboxProvider(),
      bkash: new BkashSandboxProvider(),
      nagad: new NagadSandboxProvider(),
    };
    this.licenseSigner = opts.licenseSigner ?? new SandboxLicenseSigner();
    this.usageProvider = opts.usageProvider ?? defaultUsageProvider;
    this.auditRecorder = opts.auditRecorder ?? new InMemoryAuditRecorder(opts.store);
    this.kycProvider = opts.kycProvider ?? new SandboxKycProvider();
    this.payoutConnectProvider = opts.payoutConnectProvider ?? new SandboxPayoutConnectProvider();
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  async createListing(input: {
    catalogId: string;
    sellerId: string;
    title: string;
    description?: string;
    tags?: string[];
    priceCents?: number;
    currency?: string;
    isFree?: boolean;
    preview?: Record<string, unknown>;
  }): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.creator);

    const existing = await this.store.getListingByCatalogId(input.catalogId);
    if (existing) throw new DuplicateCatalogIdError(input.catalogId);

    const now = this.now();
    const listing: MarketplaceListing = {
      id: this.idGen(),
      catalogId: input.catalogId,
      sellerId: input.sellerId,
      title: input.title,
      description: input.description ?? '',
      status: 'draft',
      isFree: input.isFree ?? (input.priceCents === 0 || input.priceCents === undefined),
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? null,
      tags: input.tags ?? [],
      preview: input.preview ?? null,
      publishedAtMs: null,
      deprecatedAtMs: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.insertListing(listing);
    return listing;
  }

  async listListings(opts?: {
    status?: string;
    sellerId?: string;
    limit?: number;
  }): Promise<MarketplaceListing[]> {
    checkFeature(FEATURE_FLAGS.storefront);
    return this.store.listListings(opts);
  }

  async getListing(listingId: string): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.storefront);
    const listing = await this.store.getListing(listingId);
    if (!listing) throw new ListingNotFoundError(listingId);
    return listing;
  }

  async updateListing(
    listingId: string,
    patch: Partial<Pick<MarketplaceListing,
      'title' | 'description' | 'priceCents' | 'currency' | 'tags' | 'preview'
    >>,
  ): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.creator);
    const existing = await this.store.getListing(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);

    const updated = await this.store.updateListing(listingId, {
      ...patch,
      updatedAt: this.now(),
    });

    await this.emitter.publish('listing.updated', {
      event_id: this.idGen(),
      event_type: 'listing.updated',
      ts_ms: this.now().getTime(),
      workspace_id: existing.sellerId,
      actor_id: existing.sellerId,
      actor_type: 'member',
      payload: { listing_id: listingId, changes: Object.keys(patch) },
    });

    return updated;
  }

  async submitListing(listingId: string): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.creator);
    const existing = await this.store.getListing(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);

    return this.transitionListing(existing, 'in_review');
  }

  async publishListing(listingId: string): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.creator);
    const existing = await this.store.getListing(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);

    return this.transitionListing(existing, 'published');
  }

  async deprecateListing(listingId: string): Promise<MarketplaceListing> {
    checkFeature(FEATURE_FLAGS.creator);
    const existing = await this.store.getListing(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);

    return this.transitionListing(existing, 'deprecated');
  }

  private async transitionListing(
    listing: MarketplaceListing,
    to: MarketplaceListing['status'],
  ): Promise<MarketplaceListing> {
    const allowed = LISTING_TRANSITIONS[listing.status];
    if (!allowed.includes(to)) {
      throw new InvalidTransitionError(listing.status, to);
    }

    const now = this.now();
    const nowMs = now.getTime();
    const patch: Record<string, unknown> = {
      status: to,
      updatedAt: now,
    };
    if (to === 'published') {
      patch.publishedAtMs = nowMs;
    }
    if (to === 'deprecated') {
      patch.deprecatedAtMs = nowMs;
    }

    const updated = await this.store.updateListing(listing.id, patch as Parameters<MarketplaceStore['updateListing']>[1]);

    // Emit domain event (NOT audit table — event_kind doesn't fit listing lifecycle)
    await this.emitter.publish(`listing.${to}`, {
      event_id: this.idGen(),
      event_type: `listing.${to}`,
      ts_ms: nowMs,
      workspace_id: listing.sellerId,
      actor_id: listing.sellerId,
      actor_type: 'member',
      payload: { listing_id: listing.id, from: listing.status, to },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Listing Versions
  // -------------------------------------------------------------------------

  async addListingVersion(input: {
    listingId: string;
    catalogId: string;
    version: string;
  }): Promise<ListingVersion> {
    checkFeature(FEATURE_FLAGS.creator);
    const version: ListingVersion = {
      id: this.idGen(),
      listingId: input.listingId,
      catalogId: input.catalogId,
      version: input.version,
      createdAt: this.now(),
    };
    await this.store.insertListingVersion(version);
    return version;
  }

  async listListingVersions(catalogId: string): Promise<ListingVersion[]> {
    checkFeature(FEATURE_FLAGS.creator);
    return this.store.listListingVersions(catalogId);
  }

  // -------------------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------------------

  async calculatePrice(
    priceCents: number,
    currency: string,
    model: PricingModel,
  ): Promise<ReturnType<typeof calculatePrice>> {
    checkFeature(FEATURE_FLAGS.pricing);
    const policy = await this.store.getPayoutPolicy();
    return calculatePrice(priceCents, currency, model, policy);
  }

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  async getPayoutPolicy(): Promise<PayoutPolicy> {
    checkFeature(FEATURE_FLAGS.payout);
    return this.store.getPayoutPolicy();
  }

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  async submitReview(input: {
    listingId: string;
    reviewerId: string;
    rating: number;
    body?: string;
    verifiedBuyer?: boolean;
  }): Promise<MarketplaceReview> {
    checkFeature(FEATURE_FLAGS.reviews);

    // Validate rating bounds
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new MarketplaceValidationError(
        `Rating must be an integer between 1 and 5, got: ${input.rating}`,
        'INVALID_RATING',
      );
    }

    // Validate body length
    const body = input.body ?? '';
    if (body.length > 4096) {
      throw new MarketplaceValidationError(
        `Review body must be at most 4096 characters, got: ${body.length}`,
        'BODY_TOO_LONG',
      );
    }

    // Verify buyer gate
    if (!input.verifiedBuyer) {
      const isVerified = await this.store.hasVerifiedPurchase(input.reviewerId, input.listingId);
      if (!isVerified) throw new NotVerifiedBuyerError();
    }

    const review: MarketplaceReview = {
      id: this.idGen(),
      listingId: input.listingId,
      reviewerId: input.reviewerId,
      rating: input.rating,
      body,
      status: 'queued',
      verifiedBuyer: input.verifiedBuyer ?? false,
      replyBody: null,
      repliedAt: null,
      createdAt: this.now(),
    };

    await this.store.insertReview(review);
    return review;
  }

  async listReviews(listingId: string): Promise<MarketplaceReview[]> {
    checkFeature(FEATURE_FLAGS.reviews);
    return this.store.listReviewsByListing(listingId);
  }

  async replyToReview(reviewId: string, replyBody: string): Promise<MarketplaceReview> {
    checkFeature(FEATURE_FLAGS.reviews);
    const existing = await this.store.getReview(reviewId);
    if (!existing) throw new ReviewNotFoundError(reviewId);

    // One reply per review
    if (existing.replyBody != null) {
      throw new AlreadyRepliedError(reviewId);
    }

    return this.store.updateReview(reviewId, {
      replyBody,
      repliedAt: this.now(),
    });
  }

  async reportReview(reviewId: string): Promise<MarketplaceReview> {
    checkFeature(FEATURE_FLAGS.reviews);
    const existing = await this.store.getReview(reviewId);
    if (!existing) throw new ReviewNotFoundError(reviewId);

    return this.store.updateReview(reviewId, {
      status: 'auto_flagged',
    });
  }

  // -------------------------------------------------------------------------
  // Curated listings (Wave-1 stub)
  // -------------------------------------------------------------------------

  async getCuratedListings(brandKitId?: string): Promise<MarketplaceListing[]> {
    checkFeature(FEATURE_FLAGS.curated);
    // Wave-1 stub: returns []. Real curated logic is Wave 4.
    void brandKitId; // passthrough param
    return [];
  }

  // -------------------------------------------------------------------------
  // Purchases (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async createPurchase(
    workspaceId: string,
    actorId: string,
    input: {
      listing_id: string;
      provider: string;
      currency: string;
      idempotency_key: string;
      quantity?: number;
      success_url?: string;
      cancel_url?: string;
    },
  ): Promise<PurchaseInitiation> {
    checkFeature(FEATURE_FLAGS.pricing);

    // Idempotency check
    const existing = await this.store.getPaymentIntentByIdempotencyKey(workspaceId, input.idempotency_key);
    if (existing) {
      return {
        purchase_id: existing.purchaseId,
        listing_id: existing.listingId,
        buyer_id: existing.buyerId,
        provider: existing.provider,
        provider_intent_id: existing.providerIntentId,
        checkout_url: undefined,
        status: existing.status,
        gross_cents: existing.grossCents,
        currency: existing.currency,
      };
    }

    // Validate listing exists and is published
    const listing = await this.store.getListing(input.listing_id);
    if (!listing) throw new ListingNotFoundError(input.listing_id);
    if (listing.status !== 'published') {
      throw new MarketplaceValidationError('Listing must be published to purchase', 'LISTING_NOT_PUBLISHED');
    }

    // Check listing is not frozen
    if ((listing as unknown as Record<string, unknown>).frozenFor) {
      throw new MarketplaceValidationError('Listing is frozen', 'LISTING_FROZEN');
    }

    // Validate currency
    const currency = normalizeCurrency(input.currency);

    // Calculate price
    const quantity = input.quantity ?? 1;
    const priceCents = (listing.priceCents ?? 0) * quantity;
    const policy = await this.store.getPayoutPolicy();
    const breakdown = calculatePrice(priceCents, currency, listing.isFree ? 'free' : 'one_time', policy);

    // Get payment provider
    const provider = this.paymentProviders[input.provider];
    if (!provider) {
      throw new MarketplaceValidationError(`Unknown payment provider: ${input.provider}`, 'UNKNOWN_PROVIDER');
    }

    // Create checkout
    const purchaseId = this.idGen();
    const checkoutInput: CreateCheckoutInput = {
      listing_id: input.listing_id,
      buyer_id: actorId,
      gross_cents: breakdown.priceCents,
      currency: breakdown.currency,
      idempotency_key: input.idempotency_key,
      success_url: input.success_url,
      cancel_url: input.cancel_url,
    };
    const checkoutResult = await provider.createCheckout(checkoutInput);

    // Create payment intent
    const now = this.now();
    const intent: PaymentIntent = {
      id: this.idGen(),
      workspaceId,
      buyerId: actorId,
      listingId: input.listing_id,
      purchaseId,
      provider: input.provider as PaymentIntent['provider'],
      providerIntentId: checkoutResult.provider_intent_id,
      currency: breakdown.currency,
      grossCents: breakdown.priceCents,
      taxCents: 0,
      feeCents: breakdown.platformFeeCents,
      netCents: breakdown.creatorShareCents,
      fxRate: 1,
      fxTimestamp: now,
      status: checkoutResult.status === 'pending' ? 'pending' : checkoutResult.status === 'succeeded' ? 'succeeded' : 'failed',
      idempotencyKey: input.idempotency_key,
      disputeStatus: 'none',
      refundStatus: 'none',
      refundedAt: null,
      refundReason: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.insertPaymentIntent(intent);

    return {
      purchase_id: purchaseId,
      listing_id: input.listing_id,
      buyer_id: actorId,
      provider: input.provider as PaymentIntent['provider'],
      provider_intent_id: checkoutResult.provider_intent_id,
      checkout_url: checkoutResult.checkout_url,
      status: intent.status,
      gross_cents: breakdown.priceCents,
      currency: breakdown.currency,
    };
  }

  async handlePaymentWebhook(
    _provider: string,
    rawBody: Buffer | string,
    signature: string,
    eventType: string,
  ): Promise<{ received: true }> {
    checkFeature(FEATURE_FLAGS.pricing);

    // Verify webhook signature
    const paymentProvider = this.paymentProviders[_provider];
    if (!paymentProvider) {
      throw new MarketplaceValidationError(`Unknown payment provider: ${_provider}`, 'UNKNOWN_PROVIDER');
    }

    const isValid = paymentProvider.verifyWebhook(rawBody, signature);
    if (!isValid) {
      throw new MarketplaceValidationError('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }

    // Determine success/failure based on event type
    const isSuccess = this.isPaymentSuccessEvent(_provider, eventType);
    const isFailure = this.isPaymentFailureEvent(_provider, eventType);

    if (!isSuccess && !isFailure) {
      // Unknown event type, just acknowledge
      return { received: true };
    }

    // Find payment intent by provider_intent_id from webhook payload
    let payload: Record<string, unknown>;
    try {
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString());
    } catch {
      throw new MarketplaceValidationError('Invalid webhook payload', 'INVALID_WEBHOOK_PAYLOAD');
    }

    const providerIntentId = this.extractProviderIntentId(_provider, payload);
    if (!providerIntentId) {
      throw new MarketplaceValidationError('Missing provider_intent_id in webhook', 'MISSING_PROVIDER_INTENT_ID');
    }

    const intent = await this.store.getPaymentIntentByProviderIntentId(providerIntentId);
    if (!intent) {
      throw new ListingNotFoundError(`Payment intent for provider_intent_id: ${providerIntentId}`);
    }

    // Idempotent: if already in terminal state, no-op
    if (intent.status === 'succeeded' || intent.status === 'failed') {
      return { received: true };
    }

    if (isSuccess) {
      // Success: update status, issue license, create revenue event, audit
      await this.store.withTransaction(async () => {
        await this.store.updatePaymentIntentStatus(intent.purchaseId, 'succeeded');

        // Issue license grant
        const token = await this.licenseSigner.issueLicenseGrant({
          listing_id: intent.listingId,
          buyer_id: intent.buyerId,
          version: '1.0',
          scopes: ['use'],
          seats: 1,
        });

        const grantId = this.idGen();
        await this.store.insertLicenseGrant({
          id: grantId,
          listingId: intent.listingId,
          buyerId: intent.buyerId,
          version: '1.0',
          scopes: ['use'],
          seats: 1,
          signedToken: token,
          createdAt: this.now(),
        });

        // Create revenue share event
        const periodMonth = this.now().toISOString().slice(0, 7);
        await this.store.insertRevenueShareEvent({
          id: this.idGen(),
          listingId: intent.listingId,
          sellerId: (await this.store.getListing(intent.listingId))?.sellerId ?? '',
          workspaceId: intent.workspaceId,
          currency: intent.currency,
          grossCents: intent.grossCents,
          feeCents: intent.feeCents,
          netCents: intent.netCents,
          periodMonth,
          eventType: 'purchase',
          payoutStatus: 'eligible',
          createdAt: this.now(),
        });
      });

      // Audit event (after transaction)
      await this.auditRecorder.record({
        workspaceId: intent.workspaceId,
        actorId: intent.buyerId,
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'purchase',
        eventType: 'purchase',
        payload: {
          purchase_id: intent.purchaseId,
          listing_id: intent.listingId,
          gross_cents: intent.grossCents,
          currency: intent.currency,
        },
      });
    } else {
      // Failure: just update status
      await this.store.updatePaymentIntentStatus(intent.purchaseId, 'failed');
    }

    return { received: true };
  }

  async requestRefund(
    _workspaceId: string,
    actorId: string,
    purchaseId: string,
    reason: string,
  ): Promise<RefundRequest> {
    checkFeature(FEATURE_FLAGS.refund);

    const intent = await this.store.getPaymentIntentByPurchaseId(purchaseId);
    if (!intent) throw new ListingNotFoundError(purchaseId);

    // Must be paid and not already refunded
    if (intent.status !== 'succeeded') {
      throw new MarketplaceValidationError('Payment must be succeeded to request refund', 'PAYMENT_NOT_SUCCEEDED');
    }
    if (intent.refundStatus !== 'none') {
      throw new MarketplaceValidationError('Refund already requested or processed', 'REFUND_ALREADY_REQUESTED');
    }

    // Check eligibility: purchased within 14 days AND usage < 5 inserts
    const daysSincePurchase = (this.now().getTime() - intent.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const insertCount = await this.usageProvider.countInserts(intent.listingId, intent.buyerId);
    const isEligible = daysSincePurchase <= 14 && insertCount < 5;

    if (isEligible) {
      // Auto-approve refund
      await this.store.withTransaction(async () => {
        await this.store.updatePaymentIntentStatus(purchaseId, 'refunded', {
          refundStatus: 'refunded',
          refundedAt: this.now(),
          refundReason: reason,
        });

        // Create refunded revenue share event
        const periodMonth = this.now().toISOString().slice(0, 7);
        await this.store.insertRevenueShareEvent({
          id: this.idGen(),
          listingId: intent.listingId,
          sellerId: (await this.store.getListing(intent.listingId))?.sellerId ?? '',
          workspaceId: intent.workspaceId,
          currency: intent.currency,
          grossCents: -intent.grossCents,
          feeCents: -intent.feeCents,
          netCents: -intent.netCents,
          periodMonth,
          eventType: 'refund',
          payoutStatus: 'refunded',
          createdAt: this.now(),
        });
      });

      // Audit event
      await this.auditRecorder.record({
        workspaceId: intent.workspaceId,
        actorId,
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'refund',
        eventType: 'refund',
        payload: {
          purchase_id: purchaseId,
          listing_id: intent.listingId,
          reason,
          auto_approved: true,
        },
      });

      return {
        purchase_id: purchaseId,
        refund_status: 'refunded',
        auto_approved: true,
        review_required: false,
      };
    } else {
      // Request admin review
      await this.store.updatePaymentIntentStatus(purchaseId, 'succeeded', {
        refundStatus: 'requested',
      });

      return {
        purchase_id: purchaseId,
        refund_status: 'requested',
        auto_approved: false,
        review_required: true,
      };
    }
  }

  async handleChargeback(
    _provider: string,
    eventType: ChargebackEventType,
    purchaseId: string,
  ): Promise<void> {
    checkFeature(FEATURE_FLAGS.chargeback);

    const intent = await this.store.getPaymentIntentByPurchaseId(purchaseId);
    if (!intent) throw new ListingNotFoundError(purchaseId);

    if (eventType === 'dispute.opened') {
      // Freeze listing
      await this.store.markListingFrozen(intent.listingId, 'dispute', this.now());
      await this.store.updatePaymentIntentStatus(purchaseId, 'disputed', {
        disputeStatus: 'opened',
      });

      // Audit
      await this.auditRecorder.record({
        workspaceId: intent.workspaceId,
        actorId: intent.buyerId,
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'payout',
        eventType: 'dispute.opened',
        payload: {
          purchase_id: purchaseId,
          listing_id: intent.listingId,
          note: 'Listing frozen due to dispute',
        },
      });
    } else if (eventType === 'dispute.won' || eventType === 'dispute.lost' || eventType === 'dispute.resolved') {
      // Unfreeze listing
      await this.store.clearListingFrozen(intent.listingId);
      const disputeStatus = eventType === 'dispute.won' ? 'won' : eventType === 'dispute.lost' ? 'lost' : 'resolved';
      await this.store.updatePaymentIntentStatus(purchaseId, 'disputed', {
        disputeStatus,
      });

      // Audit
      await this.auditRecorder.record({
        workspaceId: intent.workspaceId,
        actorId: intent.buyerId,
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'payout',
        eventType,
        payload: {
          purchase_id: purchaseId,
          listing_id: intent.listingId,
          dispute_status: disputeStatus,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers for webhooks
  // -------------------------------------------------------------------------

  private isPaymentSuccessEvent(provider: string, eventType: string): boolean {
    if (provider === 'stripe') return eventType === 'checkout.session.completed';
    if (provider === 'bkash') return eventType === 'payment.completed';
    if (provider === 'nagad') return eventType === 'payment.completed';
    return false;
  }

  private isPaymentFailureEvent(provider: string, eventType: string): boolean {
    if (provider === 'stripe') return eventType === 'checkout.session.expired';
    if (provider === 'bkash') return eventType === 'payment.failed';
    if (provider === 'nagad') return eventType === 'payment.failed';
    return false;
  }

  private extractProviderIntentId(provider: string, payload: Record<string, unknown>): string | null {
    if (provider === 'stripe') {
      return (payload.session_id as string) ?? (payload.provider_intent_id as string) ?? null;
    }
    if (provider === 'bkash') {
      return (payload.payment_id as string) ?? (payload.provider_intent_id as string) ?? null;
    }
    if (provider === 'nagad') {
      return (payload.payment_token as string) ?? (payload.provider_intent_id as string) ?? null;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Creator Profile (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async getCreatorProfile(userId: string): Promise<CreatorProfile> {
    checkFeature(FEATURE_FLAGS.kyc);

    let profile = await this.store.getCreatorProfile(userId);
    if (!profile) {
      // Auto-create with defaults
      const now = this.now();
      profile = {
        id: this.idGen(),
        userId,
        displayName: null,
        slug: null,
        bio: null,
        countryCode: null,
        payoutMethod: null,
        payoutReady: false,
        kycStatus: 'pending',
        onboardingState: 'pending',
        balanceCents: 0,
        currency: 'USD',
        createdAt: now,
        updatedAt: now,
      };
      await this.store.createCreatorProfile(profile);
    }
    return profile;
  }

  async updateCreatorProfile(
    userId: string,
    patch: Partial<Pick<CreatorProfile,
      'displayName' | 'slug' | 'bio' | 'countryCode' | 'payoutMethod'
    >>,
  ): Promise<CreatorProfile> {
    checkFeature(FEATURE_FLAGS.kyc);

    const profile = await this.getCreatorProfile(userId);
    const currentState = profile.onboardingState;

    // Determine if profile fields are complete
    const displayName = patch.displayName ?? profile.displayName;
    const slug = patch.slug ?? profile.slug;
    const countryCode = patch.countryCode ?? profile.countryCode;

    let nextState: OnboardingState = currentState;
    if (currentState === 'pending' && displayName && slug && countryCode) {
      nextState = 'profile_complete';
    }

    // Validate transition
    if (nextState !== currentState) {
      validateTransition(currentState, nextState);
    }

    const now = this.now();
    const updated = await this.store.updateCreatorProfile(userId, {
      ...patch,
      onboardingState: nextState,
      updatedAt: now,
    });

    // Emit event if state changed
    if (nextState !== currentState) {
      await this.emitter.publish('creator.onboardingStateChanged', {
        event_id: this.idGen(),
        event_type: 'creator.onboardingStateChanged',
        ts_ms: now.getTime(),
        workspace_id: userId,
        actor_id: userId,
        actor_type: 'member',
        payload: { from: currentState, to: nextState, user_id: userId },
      });
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // KYC (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async startKycSession(userId: string, countryCode: string): Promise<KycSession> {
    checkFeature(FEATURE_FLAGS.kyc);

    const profile = await this.getCreatorProfile(userId);
    const currentState = profile.onboardingState;

    // Must be profile_complete
    if (currentState !== 'profile_complete') {
      throw new OnboardingTransitionError(currentState, 'kyc_submitted');
    }

    // Check for existing open session
    const existingSession = await this.store.getKycSessionByCreator(profile.id);
    if (existingSession && existingSession.status !== 'rejected') {
      throw new KycInProgressError();
    }

    // Start KYC session
    const result = await this.kycProvider.startSession({
      creator_id: profile.id,
      country_code: countryCode,
    });

    const now = this.now();
    const session: KycSession = {
      id: this.idGen(),
      creatorId: profile.id,
      vendor: 'sandbox',
      vendorSessionId: result.vendor_session_id,
      status: 'submitted',
      lastPolledAt: null,
      raw: null,
      createdAt: now,
    };

    await this.store.createKycSession(session);

    // Advance onboarding state
    const { nextState } = startKycSessionBody(currentState);
    await this.store.updateCreatorProfile(userId, {
      onboardingState: nextState,
      kycStatus: 'submitted',
      updatedAt: now,
    });

    // Emit event
    await this.emitter.publish('kyc.status_changed', {
      event_id: this.idGen(),
      event_type: 'kyc.status_changed',
      ts_ms: now.getTime(),
      workspace_id: userId,
      actor_id: userId,
      actor_type: 'member',
      payload: {
        creator_id: profile.id,
        kyc_session_id: session.id,
        status: 'submitted',
      },
    });

    return session;
  }

  async getKycStatus(userId: string): Promise<{ session: KycSession | null; profile: CreatorProfile }> {
    checkFeature(FEATURE_FLAGS.kyc);

    const profile = await this.getCreatorProfile(userId);
    const session = await this.store.getKycSessionByCreator(profile.id);
    return { session, profile };
  }

  // -------------------------------------------------------------------------
  // Payout Methods (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createPayoutMethod(
    userId: string,
    kind: string,
    externalAccountId: string,
  ): Promise<CreatorPayoutMethod> {
    checkFeature(FEATURE_FLAGS.payout);

    const profile = await this.getCreatorProfile(userId);
    const currentState = profile.onboardingState;

    // Validate input
    createPayoutMethodBody(currentState, kind, externalAccountId);

    const now = this.now();
    const method: CreatorPayoutMethod = {
      id: this.idGen(),
      creatorId: profile.id,
      kind: kind as PayoutMethodKind,
      externalAccountId,
      verified: false,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.createPayoutMethod(method);

    // Update profile payout method
    await this.store.updateCreatorProfile(userId, {
      payoutMethod: kind,
      updatedAt: now,
    });

    return method;
  }

  async listPayoutMethods(userId: string): Promise<CreatorPayoutMethod[]> {
    checkFeature(FEATURE_FLAGS.payout);

    const profile = await this.getCreatorProfile(userId);
    return this.store.listPayoutMethodsByCreator(profile.id);
  }

  async getPayoutConnectLink(userId: string, kind: PayoutMethodKind): Promise<{ connect_url: string; expires_at: Date }> {
    checkFeature(FEATURE_FLAGS.payout);

    const profile = await this.getCreatorProfile(userId);
    const currentState = profile.onboardingState;

    // Validate state
    connectLinkBody(currentState);

    return this.payoutConnectProvider.getConnectLink({
      creator_id: profile.id,
      kind,
    });
  }

  // -------------------------------------------------------------------------
  // Curated Listings (Phase 19 Wave 4 — WS-MKT-5)
  // -------------------------------------------------------------------------

  async createBrandLock(input: {
    workspaceId: string;
    brandKitId: string;
    marketplaceListingId: string;
    state: BrandLockState;
    overridePriceCents?: number | null;
    notes?: string | null;
    auditActorId?: string | null;
    createdBy?: string | null;
  }): Promise<BrandLockedListing> {
    checkFeature(FEATURE_FLAGS.curated);

    validateBrandLockInput({
      workspaceId: input.workspaceId,
      brandKitId: input.brandKitId,
      marketplaceListingId: input.marketplaceListingId,
      state: input.state,
      overridePriceCents: input.overridePriceCents ?? null,
      notes: input.notes ?? null,
    });

    // Check if lock already exists
    const existing = await this.store.getBrandLock(
      input.workspaceId,
      input.brandKitId,
      input.marketplaceListingId,
    );
    if (existing) {
      throw new InvalidBrandLockError(
        `Brand lock already exists for listing ${input.marketplaceListingId} in brand ${input.brandKitId}`,
      );
    }

    const now = this.now();
    const lock: BrandLockedListing = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      brandKitId: input.brandKitId,
      marketplaceListingId: input.marketplaceListingId,
      state: input.state,
      overridePriceCents: input.overridePriceCents ?? null,
      notes: input.notes ?? null,
      auditActorId: input.auditActorId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    };

    await this.store.insertBrandLock(lock);

    // Audit event
    await this.auditRecorder.record({
      workspaceId: input.workspaceId,
      actorId: input.auditActorId ?? input.createdBy ?? 'system',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'brand_lock_curation',
      eventType: 'brand_lock.created',
      payload: {
        brand_lock_id: lock.id,
        brand_kit_id: input.brandKitId,
        listing_id: input.marketplaceListingId,
        state: input.state,
      },
    });

    return lock;
  }

  async getBrandLock(
    workspaceId: string,
    brandKitId: string,
    marketplaceListingId: string,
  ): Promise<BrandLockedListing> {
    checkFeature(FEATURE_FLAGS.curated);
    const lock = await this.store.getBrandLock(workspaceId, brandKitId, marketplaceListingId);
    if (!lock) throw new BrandLockNotFoundError(
      `Brand lock not found for listing ${marketplaceListingId} in brand ${brandKitId}`,
    );
    return lock;
  }

  async listBrandLocks(workspaceId: string, brandKitId: string): Promise<BrandLockedListing[]> {
    checkFeature(FEATURE_FLAGS.curated);
    return this.store.listBrandLocksByBrand(workspaceId, brandKitId);
  }

  async updateBrandLock(
    lockId: string,
    patch: Partial<Pick<BrandLockedListing, 'state' | 'overridePriceCents' | 'notes' | 'auditActorId' | 'updatedBy'>>,
  ): Promise<BrandLockedListing> {
    checkFeature(FEATURE_FLAGS.curated);

    if (patch.state !== undefined) {
      // Validate state transition is valid
      const validStates: BrandLockState[] = ['allow', 'deny', 'override'];
      if (!validStates.includes(patch.state)) {
        throw new InvalidBrandLockError(`Invalid state: ${patch.state}`);
      }
    }

    const updated = await this.store.updateBrandLock(lockId, patch);

    // Audit event
    await this.auditRecorder.record({
      workspaceId: updated.workspaceId,
      actorId: patch.auditActorId ?? patch.updatedBy ?? 'system',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'brand_lock_curation',
      eventType: 'brand_lock.updated',
      payload: {
        brand_lock_id: lockId,
        changes: Object.keys(patch),
      },
    });

    return updated;
  }

  async deleteBrandLock(lockId: string): Promise<void> {
    checkFeature(FEATURE_FLAGS.curated);
    await this.store.deleteBrandLock(lockId);
  }

  async assertBrandLockAllowed(
    workspaceId: string,
    brandKitId: string,
    marketplaceListingId: string,
  ): Promise<void> {
    checkFeature(FEATURE_FLAGS.curated);
    const locks = await this.store.listBrandLocksByBrand(workspaceId, brandKitId);
    assertNotDenied(locks, workspaceId, brandKitId, marketplaceListingId);
  }

  // -------------------------------------------------------------------------
  // Takedowns (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  async fileTakedown(input: {
    workspaceId: string;
    listingId: string;
    claimantId: string;
    kind: TakedownKind;
    evidenceUrl?: string | null | undefined;
    statement: string;
    createdBy?: string | null;
  }): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);

    validateTakedownInput({
      kind: input.kind,
      statement: input.statement,
      evidenceUrl: input.evidenceUrl ?? undefined,
    });

    // Verify listing exists
    const listing = await this.store.getListing(input.listingId);
    if (!listing) throw new ListingNotFoundError(input.listingId);

    const body = fileTakedownBody();
    const now = this.now();

    const request: TakedownRequest = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      listingId: input.listingId,
      claimantId: input.claimantId,
      kind: input.kind,
      evidenceUrl: input.evidenceUrl ?? null,
      statement: input.statement,
      status: body.status,
      resolutionNotes: null,
      submittedAt: body.submittedAt,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    };

    await this.store.insertTakedownRequest(request);

    // Audit event
    await this.auditRecorder.record({
      workspaceId: input.workspaceId,
      actorId: input.claimantId,
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'takedown',
      eventType: 'takedown.filed',
      payload: {
        takedown_id: request.id,
        listing_id: input.listingId,
        kind: input.kind,
        claimant_id: input.claimantId,
      },
    });

    return request;
  }

  async getTakedownRequest(takedownId: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const request = await this.store.getTakedownRequest(takedownId);
    if (!request) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);
    return request;
  }

  async listTakedownsByListing(listingId: string): Promise<TakedownRequest[]> {
    checkFeature(FEATURE_FLAGS.takedown);
    return this.store.listTakedownRequestsByListing(listingId);
  }

  async listTakedownRequests(opts?: { status?: TakedownRequest['status']; kind?: TakedownKind }): Promise<TakedownRequest[]> {
    checkFeature(FEATURE_FLAGS.takedown);
    return this.store.listTakedownRequests(opts);
  }

  async reviewTakedown(takedownId: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const existing = await this.store.getTakedownRequest(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);

    validateTakedownTransition(existing.status, 'in_review');

    return this.store.updateTakedownStatus(takedownId, 'in_review');
  }

  async confirmTakedown(takedownId: string, resolutionNotes?: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const existing = await this.store.getTakedownRequest(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);

    validateTakedownTransition(existing.status, 'confirmed');

    const updated = await this.store.updateTakedownStatus(takedownId, 'confirmed', {
      resolutionNotes: resolutionNotes ?? null,
    });

    // Transition listing to 'removed'
    const listing = await this.store.getListing(existing.listingId);
    if (listing) {
      await this.store.updateListing(existing.listingId, {
        status: 'removed',
        updatedAt: this.now(),
      });
    }

    // Audit event
    await this.auditRecorder.record({
      workspaceId: existing.workspaceId,
      actorId: 'system',
      actorType: 'system',
      actorKind: 'agent',
      eventKind: 'takedown',
      eventType: 'takedown.confirmed',
      payload: {
        takedown_id: takedownId,
        listing_id: existing.listingId,
        resolution_notes: resolutionNotes,
      },
    });

    return updated;
  }

  async dismissTakedown(takedownId: string, resolutionNotes?: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const existing = await this.store.getTakedownRequest(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);

    validateTakedownTransition(existing.status, 'dismissed');

    const body = takedownDismissBody(existing.status);
    return this.store.updateTakedownStatus(takedownId, body.status, {
      resolutionNotes: resolutionNotes ?? null,
      resolvedAt: body.resolvedAt,
    });
  }

  async counterNoticeTakedown(takedownId: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const existing = await this.store.getTakedownRequest(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);

    validateTakedownTransition(existing.status, 'counter_notice');
    counterNoticeBody(existing.status);

    return this.store.updateTakedownStatus(takedownId, 'counter_notice');
  }

  async resolveTakedown(takedownId: string, resolutionNotes?: string): Promise<TakedownRequest> {
    checkFeature(FEATURE_FLAGS.takedown);
    const existing = await this.store.getTakedownRequest(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);

    validateTakedownTransition(existing.status, 'resolved');
    const body = takedownResolveBody(existing.status);

    const updated = await this.store.updateTakedownStatus(takedownId, body.status, {
      resolutionNotes: resolutionNotes ?? null,
      resolvedAt: body.resolvedAt,
    });

    // If confirmed → remove listing
    if (body.listingStatus === 'removed') {
      const listing = await this.store.getListing(existing.listingId);
      if (listing) {
        await this.store.updateListing(existing.listingId, {
          status: 'removed',
          updatedAt: this.now(),
        });
      }
    }

    // Audit event
    await this.auditRecorder.record({
      workspaceId: existing.workspaceId,
      actorId: 'system',
      actorType: 'system',
      actorKind: 'agent',
      eventKind: 'takedown',
      eventType: 'takedown.resolved',
      payload: {
        takedown_id: takedownId,
        listing_id: existing.listingId,
        resolution_notes: resolutionNotes,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Trust Scoring (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  async computeAndStoreTrustScore(
    listingId: string,
    signals: Record<string, unknown>,
  ): Promise<TrustScore> {
    checkFeature(FEATURE_FLAGS.takedown);

    // Verify listing exists
    const listing = await this.store.getListing(listingId);
    if (!listing) throw new ListingNotFoundError(listingId);

    const score = computeTrustScore(signals);
    const now = this.now();

    const trustScore: TrustScore = {
      id: this.idGen(),
      listingId,
      score,
      signals,
      computedAt: now,
    };

    await this.store.upsertTrustScore(trustScore);
    return trustScore;
  }

  async getTrustScore(listingId: string): Promise<TrustScore | null> {
    checkFeature(FEATURE_FLAGS.takedown);
    return this.store.getTrustScoreByListing(listingId);
  }

  // -------------------------------------------------------------------------
  // FX Rates (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  async getFxRate(base: string, quote: string): Promise<{ base: string; quote: string; rate: number; fetched_at: Date; source: string }> {
    checkFeature(FEATURE_FLAGS.payout);

    if (!base || !quote) {
      throw new MarketplaceValidationError('base and quote currencies are required', 'INVALID_CURRENCY_PAIR');
    }

    const rate = await this.store.getLatestFxRate(base, quote);
    if (!rate) {
      throw new MarketplaceValidationError(`No FX rate found for ${base}/${quote}`, 'FX_RATE_NOT_FOUND');
    }

    return {
      base: rate.base,
      quote: rate.quote,
      rate: rate.rate,
      fetched_at: rate.fetchedAt,
      source: rate.source,
    };
  }

  // -------------------------------------------------------------------------
  // Payout Runs (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  async listPayoutRuns(opts?: { periodMonth?: string }): Promise<PayoutRun[]> {
    checkFeature(FEATURE_FLAGS.payout);
    return this.store.listPayoutRuns(opts);
  }

  async getPayoutRun(runId: string): Promise<PayoutRun> {
    checkFeature(FEATURE_FLAGS.payout);
    const run = await this.store.getPayoutRun(runId);
    if (!run) {
      throw new MarketplaceValidationError(`Payout run not found: ${runId}`, 'PAYOUT_RUN_NOT_FOUND');
    }
    return run;
  }
}
