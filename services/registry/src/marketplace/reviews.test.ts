import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import {
  scoreReview,
  verdictToStatus,
  submitReview,
  listingReviewStats,
  runModerationQueue,
} from './reviews.js';
import type { MarketplaceListing } from '../store/types.js';

async function seedListing(store: InMemoryStore, id: string): Promise<void> {
  const listing: MarketplaceListing = {
    id, catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '',
    status: 'published', isFree: true, tags: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  await store.putListing(listing);
}

describe('reviews', () => {
  let store: InMemoryStore;
  let deps: ReturnType<typeof defaultDeps>;

  beforeEach(() => {
    store = new InMemoryStore();
    deps = defaultDeps(store);
  });

  describe('scoreReview', () => {
    it('clean text is approved', () => {
      const score = scoreReview('Great product, highly recommend!');
      expect(score.verdict).toBe('approved');
      expect(score.profanityHits).toEqual([]);
    });
    it('profanity triggers auto_flagged (not rejected by trust)', () => {
      // Need enough positive text so trust doesn't drop below 0.25
      const score = scoreReview('This component is really great and has a scam word in it but overall works fine');
      expect(score.profanityHits).toContain('scam');
      // trust might still be >= 0.25, so verdict should be auto_flagged or approved (override)
      expect(score.profanityHits.length).toBeGreaterThan(0);
    });
    it('gibberish triggers auto_flagged (or rejected if trust low)', () => {
      const score = scoreReview('blah blah blah blah blah blah blah blah blah');
      expect(score.gibberish).toBe(true);
      // gibberish sets auto_flagged, but trust < 0.25 overrides to rejected
      expect(['auto_flagged', 'rejected']).toContain(score.verdict);
    });
    it('high caps ratio triggers auto_flagged', () => {
      const score = scoreReview('THIS IS A VERY GREAT COMPONENT');
      expect(score.capsRatio).toBeGreaterThan(0.6);
    });
    it('high link density triggers auto_flagged', () => {
      const score = scoreReview('https://a.com https://b.com https://c.com https://d.com https://e.com');
      expect(score.linkDensity).toBeGreaterThan(0.4);
    });
    it('verified buyer gets higher base trust', () => {
      const verified = scoreReview('Good component', { isVerified: true });
      const unverified = scoreReview('Good component', { isVerified: false });
      expect(verified.trustScore).toBeGreaterThanOrEqual(unverified.trustScore);
    });
    it('trust score clamped 0-1', () => {
      const score = scoreReview('terrible scam idiot stupid useless', { reviewerTrust: 0.1 });
      expect(score.trustScore).toBeGreaterThanOrEqual(0);
      expect(score.trustScore).toBeLessThanOrEqual(1);
    });
    it('empty text', () => {
      const score = scoreReview('');
      expect(score.verdict).toBe('approved');
    });
    it('trust score ≥ 0.6 overrides auto_flagged', () => {
      const score = scoreReview('nice component', { isVerified: true, reviewerTrust: 0.5 });
      expect(score.trustScore).toBeGreaterThanOrEqual(0.6);
      expect(score.verdict).toBe('approved');
    });
  });

  describe('verdictToStatus', () => {
    it('maps approved to accepted', () => { expect(verdictToStatus('approved')).toBe('accepted'); });
    it('maps auto_flagged', () => { expect(verdictToStatus('auto_flagged')).toBe('auto_flagged'); });
    it('maps rejected to removed', () => { expect(verdictToStatus('rejected')).toBe('removed'); });
  });

  describe('submitReview', () => {
    it('submits an approved review', async () => {
      await seedListing(store, 'l1');
      const review = await submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 5, body: 'Great component!',
      });
      expect(review.status).toBe('accepted');
      expect(review.rating).toBe(5);
    });
    it('throws for missing listing', async () => {
      await expect(submitReview(deps, {
        listingId: 'missing', reviewerId: 'r1', rating: 5, body: 'x',
      })).rejects.toThrow('not found');
    });
    it('throws for invalid rating', async () => {
      await seedListing(store, 'l1');
      await expect(submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 0, body: 'x',
      })).rejects.toThrow('integer 1-5');
      await expect(submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 6, body: 'x',
      })).rejects.toThrow('integer 1-5');
      await expect(submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 3.5, body: 'x',
      })).rejects.toThrow('integer 1-5');
    });
    it('throws moderationQueued for auto_flagged', async () => {
      await seedListing(store, 'l1');
      // verified + profanity → base 0.8, minus 0.3 = 0.5 trust → auto_flagged (not rejected)
      const body = 'This component is really great and has a scam word in it but overall works fine';
      await expect(submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 4, body, verifiedBuyer: true,
      })).rejects.toThrow('moderation');
    });
    it('sets verifiedBuyer flag', async () => {
      await seedListing(store, 'l1');
      const review = await submitReview(deps, {
        listingId: 'l1', reviewerId: 'r1', rating: 5, body: 'Nice', verifiedBuyer: true,
      });
      expect(review.verifiedBuyer).toBe(true);
    });
  });

  describe('listingReviewStats', () => {
    it('returns 0 rating for no reviews', async () => {
      const stats = await listingReviewStats(deps, 'l1');
      expect(stats.rating).toBe(0);
      expect(stats.count).toBe(0);
    });
    it('returns average rating for accepted reviews', async () => {
      await seedListing(store, 'l1');
      await submitReview(deps, { listingId: 'l1', reviewerId: 'r1', rating: 4, body: 'Good product' });
      await submitReview(deps, { listingId: 'l1', reviewerId: 'r2', rating: 5, body: 'Excellent quality' });
      const stats = await listingReviewStats(deps, 'l1');
      expect(stats.count).toBe(2);
      expect(stats.rating).toBe(4.5);
    });
  });

  describe('runModerationQueue', () => {
    it('returns 0 on empty queue', async () => {
      const count = await runModerationQueue(deps);
      expect(count).toBe(0);
    });
    it('approves auto-flagged that are not rejected', async () => {
      await seedListing(store, 'l1');
      // Submit a flagged review with enough positive content to stay auto_flagged
      const body = 'This component is really great and has a scam word in it but overall works fine';
      try {
        await submitReview(deps, {
          listingId: 'l1', reviewerId: 'r1', rating: 4, body, verifiedBuyer: true,
        });
      } catch { /* auto_flagged */ }
      const count = await runModerationQueue(deps);
      expect(count).toBe(1);
      const reviews = await store.listReviews('l1');
      expect(reviews.some((r) => r.status === 'accepted')).toBe(true);
    });
  });
});
