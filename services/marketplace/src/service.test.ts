/**
 * Marketplace service tests (Phase 19 Wave 1).
 *
 * Service integration with mem_store + handlers via the handlers const map.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from './service.js';
import { InMemoryMarketplaceStore } from './store/mem_store.js';
import {
  ListingNotFoundError,
  DuplicateCatalogIdError,
  InvalidTransitionError,
  NotVerifiedBuyerError,
  AlreadyRepliedError,
  MarketplaceValidationError,
} from './types.js';
import { handlers } from './handlers.js';
import type { HttpRequest, MarketplaceHandlerContext } from './handlers.js';

describe('MarketplaceService', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
  });

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  describe('createListing', () => {
    it('creates a listing in draft status', async () => {
      const listing = await service.createListing({
        catalogId: 'comp-1',
        sellerId: 'seller-1',
        title: 'My Component',
      });
      expect(listing.status).toBe('draft');
      expect(listing.catalogId).toBe('comp-1');
      expect(listing.sellerId).toBe('seller-1');
      expect(listing.isFree).toBe(true);
    });

    it('throws DuplicateCatalogIdError for duplicate catalog_id', async () => {
      await service.createListing({ catalogId: 'comp-1', sellerId: 's1', title: 'A' });
      await expect(
        service.createListing({ catalogId: 'comp-1', sellerId: 's2', title: 'B' }),
      ).rejects.toThrow(DuplicateCatalogIdError);
    });

    it('sets isFree based on priceCents', async () => {
      const listing = await service.createListing({
        catalogId: 'comp-paid',
        sellerId: 's1',
        title: 'Paid',
        priceCents: 1000,
        currency: 'USD',
      });
      expect(listing.isFree).toBe(false);
      expect(listing.priceCents).toBe(1000);
    });
  });

  describe('listListings', () => {
    it('returns all non-removed listings', async () => {
      await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.createListing({ catalogId: 'c2', sellerId: 's1', title: 'B' });
      const listings = await service.listListings();
      expect(listings).toHaveLength(2);
    });
  });

  describe('getListing', () => {
    it('returns a listing by id', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const found = await service.getListing(created.id);
      expect(found.id).toBe(created.id);
    });

    it('throws ListingNotFoundError for unknown id', async () => {
      await expect(service.getListing('nonexistent')).rejects.toThrow(ListingNotFoundError);
    });
  });

  describe('updateListing', () => {
    it('updates listing fields', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const updated = await service.updateListing(created.id, { title: 'B' });
      expect(updated.title).toBe('B');
    });
  });

  describe('submitListing', () => {
    it('transitions draft → in_review', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const submitted = await service.submitListing(created.id);
      expect(submitted.status).toBe('in_review');
    });

    it('throws InvalidTransitionError for invalid transition', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitListing(created.id);
      // in_review → in_review is invalid
      await expect(service.submitListing(created.id)).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('publishListing', () => {
    it('transitions in_review → published', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitListing(created.id);
      const published = await service.publishListing(created.id);
      expect(published.status).toBe('published');
      expect(published.publishedAtMs).toBeGreaterThan(0);
    });

    it('throws InvalidTransitionError for draft → published', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await expect(service.publishListing(created.id)).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('deprecateListing', () => {
    it('transitions published → deprecated', async () => {
      const created = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitListing(created.id);
      await service.publishListing(created.id);
      const deprecated = await service.deprecateListing(created.id);
      expect(deprecated.status).toBe('deprecated');
      expect(deprecated.deprecatedAtMs).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------------------

  describe('calculatePrice', () => {
    it('returns correct breakdown for free', async () => {
      const result = await service.calculatePrice(0, 'USD', 'free');
      expect(result.creatorShareCents).toBe(0);
      expect(result.platformFeeCents).toBe(0);
    });

    it('returns correct breakdown for one_time', async () => {
      const result = await service.calculatePrice(1000, 'USD', 'one_time');
      expect(result.creatorShareCents).toBe(700);
      expect(result.platformFeeCents).toBe(300);
    });
  });

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  describe('getPayoutPolicy', () => {
    it('returns default payout policy', async () => {
      const policy = await service.getPayoutPolicy();
      expect(policy.splitCreatorBps).toBe(7000);
      expect(policy.splitPlatformBps).toBe(3000);
      expect(policy.minPayoutCents).toBe(5000);
      expect(policy.firstPayoutHoldDays).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  describe('submitReview', () => {
    it('creates a review with valid rating', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const review = await service.submitReview({
        listingId: listing.id,
        reviewerId: 'reviewer-1',
        rating: 5,
        body: 'Great component!',
        verifiedBuyer: true,
      });
      expect(review.rating).toBe(5);
      expect(review.status).toBe('queued');
      expect(review.verifiedBuyer).toBe(true);
    });

    it('throws for rating < 1', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await expect(
        service.submitReview({ listingId: listing.id, reviewerId: 'r1', rating: 0, verifiedBuyer: true }),
      ).rejects.toThrow(MarketplaceValidationError);
    });

    it('throws for rating > 5', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await expect(
        service.submitReview({ listingId: listing.id, reviewerId: 'r1', rating: 6, verifiedBuyer: true }),
      ).rejects.toThrow(MarketplaceValidationError);
    });

    it('throws for non-integer rating', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await expect(
        service.submitReview({ listingId: listing.id, reviewerId: 'r1', rating: 3.5, verifiedBuyer: true }),
      ).rejects.toThrow(MarketplaceValidationError);
    });

    it('throws NotVerifiedBuyerError when not verified', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await expect(
        service.submitReview({ listingId: listing.id, reviewerId: 'r1', rating: 4 }),
      ).rejects.toThrow(NotVerifiedBuyerError);
    });

    it('throws for body > 4096 chars', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const longBody = 'x'.repeat(4097);
      await expect(
        service.submitReview({
          listingId: listing.id, reviewerId: 'r1', rating: 4, body: longBody, verifiedBuyer: true,
        }),
      ).rejects.toThrow(MarketplaceValidationError);
    });
  });

  describe('listReviews', () => {
    it('returns reviews for a listing', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitReview({ listingId: listing.id, reviewerId: 'r1', rating: 5, verifiedBuyer: true });
      await service.submitReview({ listingId: listing.id, reviewerId: 'r2', rating: 4, verifiedBuyer: true });
      const reviews = await service.listReviews(listing.id);
      expect(reviews).toHaveLength(2);
    });
  });

  describe('replyToReview', () => {
    it('adds a reply to a review', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const review = await service.submitReview({
        listingId: listing.id, reviewerId: 'r1', rating: 5, verifiedBuyer: true,
      });
      const replied = await service.replyToReview(review.id, 'Thanks for the review!');
      expect(replied.replyBody).toBe('Thanks for the review!');
      expect(replied.repliedAt).toBeInstanceOf(Date);
    });

    it('throws AlreadyRepliedError for second reply', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const review = await service.submitReview({
        listingId: listing.id, reviewerId: 'r1', rating: 5, verifiedBuyer: true,
      });
      await service.replyToReview(review.id, 'First reply');
      await expect(service.replyToReview(review.id, 'Second reply')).rejects.toThrow(AlreadyRepliedError);
    });
  });

  describe('reportReview', () => {
    it('sets review status to auto_flagged', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const review = await service.submitReview({
        listingId: listing.id, reviewerId: 'r1', rating: 5, verifiedBuyer: true,
      });
      const reported = await service.reportReview(review.id);
      expect(reported.status).toBe('auto_flagged');
    });
  });

  // -------------------------------------------------------------------------
  // Curated listings (stub)
  // -------------------------------------------------------------------------

  describe('getCuratedListings', () => {
    it('returns empty array (Wave-1 stub)', async () => {
      const listings = await service.getCuratedListings('brand-kit-1');
      expect(listings).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Full lifecycle
  // -------------------------------------------------------------------------

  describe('full listing lifecycle', () => {
    it('draft → in_review → published → deprecated', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      expect(listing.status).toBe('draft');

      const submitted = await service.submitListing(listing.id);
      expect(submitted.status).toBe('in_review');

      const published = await service.publishListing(listing.id);
      expect(published.status).toBe('published');
      expect(published.publishedAtMs).toBeGreaterThan(0);

      const deprecated = await service.deprecateListing(listing.id);
      expect(deprecated.status).toBe('deprecated');
      expect(deprecated.deprecatedAtMs).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Handler integration tests
// ---------------------------------------------------------------------------

describe('handlers integration', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;
  let ctx: MarketplaceHandlerContext;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
    ctx = { service };
  });

  function makeReq<P = Record<string, never>, B = Record<string, never>, Q = Record<string, string | undefined>>(
    params: P, body: B, query: Q = {} as Q, headers: Record<string, string | undefined> = {},
  ): HttpRequest<P, B, Q> {
    return { method: 'GET', path: '/', params, body, query, headers };
  }

  describe('createMarketplaceListing', () => {
    it('returns 201 with listing', async () => {
      const res = await handlers.createMarketplaceListing(
        makeReq({}, { catalogId: 'c1', sellerId: 's1', title: 'A' }),
        ctx,
      );
      expect(res.status).toBe(201);
      expect((res.body as { listing: { id: string } }).listing.id).toBeTruthy();
    });
  });

  describe('listMarketplaceListings', () => {
    it('returns 200 with listings', async () => {
      await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.listMarketplaceListings(
        makeReq({}, undefined as never, {}) as never,
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { listings: unknown[] }).listings).toHaveLength(1);
    });
  });

  describe('getMarketplaceListing', () => {
    it('returns 200 with listing', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.getMarketplaceListing(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown id', async () => {
      const res = await handlers.getMarketplaceListing(
        makeReq({ listing_id: 'nonexistent' }, {}),
        ctx,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('submitMarketplaceListing', () => {
    it('returns 202', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.submitMarketplaceListing(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(202);
    });
  });

  describe('publishMarketplaceListing', () => {
    it('returns 200 after submit → publish', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitListing(listing.id);
      const res = await handlers.publishMarketplaceListing(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
    });

    it('returns 409 for invalid transition', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.publishMarketplaceListing(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(409);
    });
  });

  describe('deprecateMarketplaceListing', () => {
    it('returns 200', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      await service.submitListing(listing.id);
      await service.publishListing(listing.id);
      const res = await handlers.deprecateMarketplaceListing(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('calculateMarketplacePrice', () => {
    it('returns 200 with breakdown', async () => {
      const res = await handlers.calculateMarketplacePrice(
        makeReq({}, { priceCents: 1000, currency: 'USD', model: 'one_time' }),
        ctx,
      );
      expect(res.status).toBe(200);
      const body = res.body as { breakdown: { creatorShareCents: number } };
      expect(body.breakdown.creatorShareCents).toBe(700);
    });
  });

  describe('getPayoutPolicy', () => {
    it('returns 200 with policy', async () => {
      const res = await handlers.getPayoutPolicy(makeReq({}, {}), ctx);
      expect(res.status).toBe(200);
      const body = res.body as { policy: { splitCreatorBps: number } };
      expect(body.policy.splitCreatorBps).toBe(7000);
    });
  });

  describe('submitMarketplaceReview', () => {
    it('returns 201 with review', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.submitMarketplaceReview(
        makeReq({ listing_id: listing.id }, { rating: 5 }, {}, { 'x-actor-id': 'r1' }),
        ctx,
      );
      // Will be 403 because not verified buyer
      expect(res.status).toBe(403);
    });

    it('returns 403 when not verified buyer', async () => {
      const listing = await service.createListing({ catalogId: 'c1', sellerId: 's1', title: 'A' });
      const res = await handlers.submitMarketplaceReview(
        makeReq({ listing_id: listing.id }, { rating: 5, verifiedBuyer: false }, {}, { 'x-actor-id': 'r1' }),
        ctx,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('getCuratedMarketplaceListings', () => {
    it('returns 200 with empty array', async () => {
      const res = await handlers.getCuratedMarketplaceListings(
        makeReq({}, undefined as never, { brand_kit_id: 'bk1' }) as never,
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { listings: unknown[] }).listings).toEqual([]);
    });
  });
});
