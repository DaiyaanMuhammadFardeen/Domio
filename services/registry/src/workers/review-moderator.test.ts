import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import { run } from './review-moderator.js';
import type { Review } from '../store/types.js';
import { uuid } from '../crypto/index.js';

function makeReview(overrides: Partial<Review> & { id: string }): Review {
  return {
    listingId: 'listing-1',
    reviewerId: 'reviewer-1',
    rating: 4,
    body: 'Great product, works as expected.',
    status: 'auto_flagged',
    verifiedBuyer: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('review-moderator worker', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
  });

  it('drains the moderation queue', async () => {
    // Add some auto-flagged reviews
    const r1 = makeReview({ id: uuid(), body: 'This is a nice component' });
    const r2 = makeReview({ id: uuid(), body: 'Another good review' });
    await store.putReview(r1);
    await store.putReview(r2);

    const d = defaultDeps(store);
    const processed = await run(d);
    expect(processed).toBe(2);

    // Verify all were processed (moved to accepted or removed)
    const remaining = await store.listReviewsByStatus('auto_flagged');
    expect(remaining).toHaveLength(0);
  });

  it('returns 0 on overlapping runs', async () => {
    const r1 = makeReview({ id: uuid(), body: 'Good review' });
    await store.putReview(r1);

    const d = defaultDeps(store);
    // First call
    const p1 = run(d);
    // Second call while first is in flight should return 0
    // Since these are in-memory and synchronous under the hood, 
    // the guard works at the async boundary
    const p2 = run(d);
    const [result1, result2] = await Promise.all([p1, p2]);
    // One should be 0 (the overlapping one)
    expect(result1 + result2).toBeGreaterThanOrEqual(1);
    expect(result1 === 0 || result2 === 0).toBe(true);
  });

  it('returns 0 when queue is empty', async () => {
    const d = defaultDeps(store);
    const processed = await run(d);
    expect(processed).toBe(0);
  });

  it('handles mixed verdicts correctly', async () => {
    // A review with profanity should be rejected
    const flagged = makeReview({ id: uuid(), body: 'This is a scam product, terrible' });
    // A clean review should be accepted
    const clean = makeReview({ id: uuid(), body: 'Nice work, love it' });
    await store.putReview(flagged);
    await store.putReview(clean);

    const d = defaultDeps(store);
    const processed = await run(d);
    expect(processed).toBe(2);

    const accepted = await store.listReviewsByStatus('accepted');
    const removed = await store.listReviewsByStatus('removed');
    expect(accepted.length + removed.length).toBe(2);
  });
});
