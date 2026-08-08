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
import { calculatePrice } from './pricing.js';
import type { MarketplaceStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MarketplaceServiceOptions {
  readonly store: MarketplaceStore;
  readonly eventEmitter?: MarketplaceEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MarketplaceService {
  private readonly store: MarketplaceStore;
  private readonly emitter: MarketplaceEventEmitter;
  private readonly clock: () => Date;

  constructor(opts: MarketplaceServiceOptions) {
    if (!opts.store) throw new Error('MarketplaceService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
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
}
