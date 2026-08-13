/**
 * Tests for Wave 9 §S9.5 — Creator review service.
 *
 * Mocks global fetch and exercises listCreatorReviews happy + error paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCreatorReviews } from './review-service';

const sample = {
  rows: [
    {
      id: 'rv_1',
      listing_id: 'lst_1',
      reviewer_id: 'usr_a',
      rating: 5,
      body: 'Excellent!',
      status: 'accepted',
      verified_buyer: true,
      created_at: 1_700_000_000_000,
      listing_title: 'Cool component',
      listing_slug: 'cool-component',
      reply: null,
    },
    {
      id: 'rv_2',
      listing_id: 'lst_2',
      reviewer_id: 'usr_b',
      rating: 3,
      body: 'It was OK',
      status: 'queued',
      verified_buyer: false,
      created_at: 1_700_000_100_000,
      listing_title: 'Neat template',
      listing_slug: 'neat-template',
      reply: {
        id: 'rp_2',
        body: 'Thanks for the feedback!',
        created_at: 1_700_000_200_000,
      },
    },
  ],
};

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('creator-console review-service / listCreatorReviews', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed rows with embedded listing title and slug', async () => {
    mockFetchOnce(200, sample);
    const rows = await listCreatorReviews('ws-1');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.listing_title).toBe('Cool component');
    expect(rows[0]!.listing_slug).toBe('cool-component');
    expect(rows[1]!.reply?.body).toBe('Thanks for the feedback!');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/creator/reviews?workspace_id=ws-1'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns an empty array when the API errors', async () => {
    mockFetchOnce(500, { detail: 'Internal' });
    const rows = await listCreatorReviews('ws-1');
    expect(rows).toEqual([]);
  });

  it('returns an empty array when rows is missing', async () => {
    mockFetchOnce(200, {});
    const rows = await listCreatorReviews('ws-1');
    expect(rows).toEqual([]);
  });
});
