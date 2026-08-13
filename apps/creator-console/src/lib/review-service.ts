/**
 * Creator-console review service — Wave 9 §S9.5.
 *
 * Lists reviews across all of the creator's listings, with the listing
 * title embedded so the dashboard can render without extra round-trips.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Reply {
  readonly id: string;
  readonly review_id: string;
  readonly body: string;
  readonly created_at: number;
  readonly creator_id: string;
}

export interface Review {
  readonly id: string;
  readonly listing_id: string;
  readonly reviewer_id: string;
  readonly rating: number;
  readonly body: string;
  readonly status: 'queued' | 'accepted' | 'auto_flagged' | 'removed';
  readonly verified_buyer: boolean;
  readonly created_at: number;
}

export interface ReviewWithListing extends Review {
  readonly listing_title: string;
  readonly listing_slug: string;
  readonly reviewer_name?: string;
  readonly reply: {
    readonly id: string;
    readonly body: string;
    readonly created_at: number;
  } | null;
}

export interface CreatorReviewsResponse {
  readonly rows: ReadonlyArray<ReviewWithListing>;
}

/**
 * POST /v1/marketplace/reviews/:id/replies
 * Mirrors marketplace-web replyToReview — the console calls it directly
 * with the buyer's session token to enable creator-side replies.
 */
export async function replyToReview(reviewId: string, payload: { body: string }): Promise<Reply> {
  return fetcher<Reply>(
    API_BASE,
    `/v1/marketplace/reviews/${encodeURIComponent(reviewId)}/replies`,
    { method: 'POST', body: payload },
  );
}

/**
 * GET /v1/creator/reviews?workspace_id=…
 */
export async function listCreatorReviews(
  workspaceId: string,
): Promise<ReadonlyArray<ReviewWithListing>> {
  try {
    const json = await fetcher<CreatorReviewsResponse>(
      API_BASE,
      `/v1/creator/reviews?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}
