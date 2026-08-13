/**
 * Wave 9 §S9.5 — Reviews + Ratings service tests (marketplace-web).
 *
 * Mocks global `fetch` with vi.fn() and exercises happy-path + error
 * branches across listReviews, submitReview, replyToReview, and markHelpful.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listReviews,
  submitReview,
  replyToReview,
  markHelpful,
  type Reply,
  type ReviewWithReply,
} from './review-service';

const sampleReview: ReviewWithReply = {
  id: 'rv_1',
  listing_id: 'lst_1',
  reviewer_id: 'usr_buyer',
  rating: 5,
  body: 'Loved it!',
  status: 'accepted',
  verified_buyer: true,
  created_at: 1_700_000_000_000,
  reply: null,
  helpful_count: 0,
};

const sampleReply: Reply = {
  id: 'rp_1',
  review_id: 'rv_1',
  body: 'Thanks for the kind words!',
  created_at: 1_700_000_100_000,
  creator_id: 'usr_creator',
};

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(json),
    text: async () => json,
  } as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('review-service / listReviews', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns reviews + replies for a listing', async () => {
    mockFetchOnce(200, {
      items: [sampleReview, { ...sampleReview, id: 'rv_2', reply: sampleReply }],
      total: 2,
    });
    const res = await listReviews('lst_1');
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items[1]!.reply?.body).toBe('Thanks for the kind words!');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/marketplace/listings/lst_1/reviews'),
      expect.any(Object),
    );
  });

  it('throws when the API returns 500', async () => {
    mockFetchOnce(500, { detail: 'Internal error' });
    await expect(listReviews('lst_1')).rejects.toThrow('Internal error');
  });
});

describe('review-service / submitReview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a new review and returns it', async () => {
    const fn = mockFetchOnce(201, { ...sampleReview, id: 'rv_new', rating: 4 });
    const created = await submitReview('lst_1', { rating: 4, body: 'Great' });
    expect(created.id).toBe('rv_new');
    expect(created.rating).toBe(4);
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining('/v1/marketplace/listings/lst_1/reviews'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ rating: 4, body: 'Great' }),
      }),
    );
  });

  it('surfaces moderation error detail when the API rejects (spam)', async () => {
    mockFetchOnce(422, { detail: 'Spam detected', title: 'Spam filter' });
    await expect(
      submitReview('lst_1', { rating: 1, body: 'BUY MY CRYPTO!!' }),
    ).rejects.toThrow(/Spam detected/);
  });
});

describe('review-service / replyToReview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the reply and returns it', async () => {
    const fn = mockFetchOnce(201, sampleReply);
    const reply = await replyToReview('rv_1', { body: 'Thanks!' });
    expect(reply.id).toBe('rp_1');
    expect(reply.body).toBe('Thanks for the kind words!');
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining('/v1/marketplace/reviews/rv_1/replies'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Thanks!' }),
      }),
    );
  });

  it('throws when a second reply is attempted (idempotent / server-enforced)', async () => {
    mockFetchOnce(409, { detail: 'Reply already exists' });
    await expect(replyToReview('rv_1', { body: 'Again!' })).rejects.toThrow(
      /already exists/,
    );
  });
});

describe('review-service / markHelpful', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /helpful and resolves', async () => {
    const fn = mockFetchOnce(204, '');
    await expect(markHelpful('rv_1')).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining('/v1/marketplace/reviews/rv_1/helpful'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on API error', async () => {
    mockFetchOnce(401, { detail: 'Unauthorized' });
    await expect(markHelpful('rv_1')).rejects.toThrow(/Unauthorized/);
  });
});
