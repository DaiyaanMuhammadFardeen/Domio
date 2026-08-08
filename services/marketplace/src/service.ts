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
}
