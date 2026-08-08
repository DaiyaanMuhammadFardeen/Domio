/**
 * In-memory marketplace store tests (Phase 19 Wave 1).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMarketplaceStore } from './mem_store.js';
import { ListingNotFoundError, ReviewNotFoundError } from '../types.js';
import type { MarketplaceListing, MarketplaceReview } from '../types.js';

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: overrides.id ?? 'listing-1',
    catalogId: overrides.catalogId ?? 'comp-1',
    sellerId: overrides.sellerId ?? 'seller-1',
    title: overrides.title ?? 'Test Component',
    description: overrides.description ?? 'A test component',
    status: overrides.status ?? 'draft',
    isFree: overrides.isFree ?? true,
    priceCents: overrides.priceCents ?? null,
    currency: overrides.currency ?? null,
    tags: overrides.tags ?? [],
    preview: overrides.preview ?? null,
    publishedAtMs: overrides.publishedAtMs ?? null,
    deprecatedAtMs: overrides.deprecatedAtMs ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function makeReview(overrides: Partial<MarketplaceReview> = {}): MarketplaceReview {
  return {
    id: overrides.id ?? 'review-1',
    listingId: overrides.listingId ?? 'listing-1',
    reviewerId: overrides.reviewerId ?? 'reviewer-1',
    rating: overrides.rating ?? 5,
    body: overrides.body ?? 'Great!',
    status: overrides.status ?? 'queued',
    verifiedBuyer: overrides.verifiedBuyer ?? true,
    replyBody: overrides.replyBody ?? null,
    repliedAt: overrides.repliedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

describe('InMemoryMarketplaceStore', () => {
  let store: InMemoryMarketplaceStore;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
  });

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  describe('listings', () => {
    it('inserts and retrieves a listing', async () => {
      const listing = makeListing();
      await store.insertListing(listing);
      const found = await store.getListing('listing-1');
      expect(found?.id).toBe('listing-1');
    });

    it('returns null for unknown listing', async () => {
      const found = await store.getListing('nonexistent');
      expect(found).toBeNull();
    });

    it('getListingByCatalogId returns non-removed listing', async () => {
      await store.insertListing(makeListing({ catalogId: 'c1', status: 'draft' }));
      const found = await store.getListingByCatalogId('c1');
      expect(found?.catalogId).toBe('c1');
    });

    it('getListingByCatalogId skips removed listings', async () => {
      await store.insertListing(makeListing({ catalogId: 'c1', status: 'removed' }));
      const found = await store.getListingByCatalogId('c1');
      expect(found).toBeNull();
    });

    it('listListings returns non-removed listings by default', async () => {
      await store.insertListing(makeListing({ id: 'l1', status: 'draft' }));
      await store.insertListing(makeListing({ id: 'l2', status: 'published' }));
      await store.insertListing(makeListing({ id: 'l3', status: 'removed' }));
      const listings = await store.listListings();
      expect(listings).toHaveLength(2);
    });

    it('listListings filters by status', async () => {
      await store.insertListing(makeListing({ id: 'l1', status: 'draft' }));
      await store.insertListing(makeListing({ id: 'l2', status: 'published' }));
      const listings = await store.listListings({ status: 'published' });
      expect(listings).toHaveLength(1);
      expect(listings[0]!.status).toBe('published');
    });

    it('listListings filters by sellerId', async () => {
      await store.insertListing(makeListing({ id: 'l1', sellerId: 's1' }));
      await store.insertListing(makeListing({ id: 'l2', sellerId: 's2' }));
      const listings = await store.listListings({ sellerId: 's1' });
      expect(listings).toHaveLength(1);
    });

    it('listListings respects limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.insertListing(makeListing({ id: `l${i}` }));
      }
      const listings = await store.listListings({ limit: 3 });
      expect(listings).toHaveLength(3);
    });

    it('updateListing updates fields', async () => {
      await store.insertListing(makeListing());
      const updated = await store.updateListing('listing-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');
    });

    it('updateListing throws for unknown listing', async () => {
      await expect(store.updateListing('nonexistent', { title: 'X' })).rejects.toThrow(ListingNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  describe('reviews', () => {
    it('inserts and retrieves a review', async () => {
      const review = makeReview();
      await store.insertReview(review);
      const found = await store.getReview('review-1');
      expect(found?.id).toBe('review-1');
    });

    it('returns null for unknown review', async () => {
      const found = await store.getReview('nonexistent');
      expect(found).toBeNull();
    });

    it('listReviewsByListing returns reviews for a listing', async () => {
      await store.insertReview(makeReview({ id: 'r1', listingId: 'l1' }));
      await store.insertReview(makeReview({ id: 'r2', listingId: 'l1' }));
      await store.insertReview(makeReview({ id: 'r3', listingId: 'l2' }));
      const reviews = await store.listReviewsByListing('l1');
      expect(reviews).toHaveLength(2);
    });

    it('updateReview updates status', async () => {
      await store.insertReview(makeReview());
      const updated = await store.updateReview('review-1', { status: 'accepted' });
      expect(updated.status).toBe('accepted');
    });

    it('updateReview handles reply fields', async () => {
      await store.insertReview(makeReview());
      const updated = await store.updateReview('review-1', {
        replyBody: 'Thanks!',
        repliedAt: new Date(),
      });
      expect(updated.replyBody).toBe('Thanks!');
      expect(updated.repliedAt).toBeInstanceOf(Date);
    });

    it('updateReview throws for unknown review', async () => {
      await expect(store.updateReview('nonexistent', { status: 'accepted' })).rejects.toThrow(ReviewNotFoundError);
    });

    it('hasVerifiedPurchase returns false by default', async () => {
      const result = await store.hasVerifiedPurchase('r1', 'l1');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  describe('payout policy', () => {
    it('returns default payout policy', async () => {
      const policy = await store.getPayoutPolicy();
      expect(policy.splitCreatorBps).toBe(7000);
      expect(policy.splitPlatformBps).toBe(3000);
    });
  });

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  describe('audit', () => {
    it('insertAuditEvent stores event', async () => {
      const event = {
        id: 'e1', workspaceId: 'ws1', actorId: 'u1',
        actorType: 'user' as const, actorKind: 'human' as const,
        eventKind: 'purchase' as const, eventType: 'purchase',
        payload: {}, seq: 1, prevHash: '', hash: 'h1', kid: 'mk1',
        recordedAt: new Date(),
      };
      await store.insertAuditEvent(event);
    });

    it('getNextAuditSeq returns 1 for empty chain', async () => {
      const seq = await store.getNextAuditSeq('ws1', 'purchase');
      expect(seq).toBe(1);
    });

    it('getNextAuditSeq increments', async () => {
      const event = {
        id: 'e1', workspaceId: 'ws1', actorId: 'u1',
        actorType: 'user' as const, actorKind: 'human' as const,
        eventKind: 'purchase' as const, eventType: 'purchase',
        payload: {}, seq: 1, prevHash: '', hash: 'h1', kid: 'mk1',
        recordedAt: new Date(),
      };
      await store.insertAuditEvent(event);
      const seq = await store.getNextAuditSeq('ws1', 'purchase');
      expect(seq).toBe(2);
    });

    it('getLastAuditHash returns empty for empty chain', async () => {
      const hash = await store.getLastAuditHash('ws1', 'purchase');
      expect(hash).toBe('');
    });

    it('getLastAuditHash returns latest hash', async () => {
      const event = {
        id: 'e1', workspaceId: 'ws1', actorId: 'u1',
        actorType: 'user' as const, actorKind: 'human' as const,
        eventKind: 'purchase' as const, eventType: 'purchase',
        payload: {}, seq: 1, prevHash: '', hash: 'hash-abc', kid: 'mk1',
        recordedAt: new Date(),
      };
      await store.insertAuditEvent(event);
      const hash = await store.getLastAuditHash('ws1', 'purchase');
      expect(hash).toBe('hash-abc');
    });
  });

  // -------------------------------------------------------------------------
  // withTransaction
  // -------------------------------------------------------------------------

  describe('withTransaction', () => {
    it('executes function and returns result', async () => {
      const result = await store.withTransaction(async () => {
        return 42;
      });
      expect(result).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('removes all data', async () => {
      await store.insertListing(makeListing());
      await store.insertReview(makeReview());
      store.clear();
      expect(await store.getListing('listing-1')).toBeNull();
      expect(await store.getReview('review-1')).toBeNull();
    });
  });
});
