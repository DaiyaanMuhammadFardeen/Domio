/**
 * Marketplace review service — Wave 9 §S9.5 (Reviews + Ratings).
 *
 * Functions:
 *   - listReviews(listingId)          list reviews + replies for a listing
 *   - submitReview(listingId, input)  buyers submit a new review
 *   - replyToReview(reviewId, input)  creator posts a reply (server enforces 1x)
 *   - markHelpful(reviewId)           buyers vote a review as helpful
 */

import type { Review } from './types';

/* ── Types ──────────────────────────────────────────────────────────── */

export interface Reply {
  readonly id: string;
  readonly review_id: string;
  readonly body: string;
  readonly created_at: number;
  readonly creator_id: string;
}

export interface ReviewWithReply extends Review {
  readonly reply: Reply | null;
  readonly helpful_count?: number;
}

export interface ReviewListResponse {
  readonly items: ReadonlyArray<ReviewWithReply>;
  readonly total: number;
}

export interface SubmitReviewInput {
  readonly rating: number;
  readonly body: string;
}

export interface ReplyInput {
  readonly body: string;
}

/* ── Low-level fetch wrapper ───────────────────────────────────────── */

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let detail = `review-service: ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      detail = body.detail ?? body.title ?? detail;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ── Public API ────────────────────────────────────────────────────── */

/**
 * GET /v1/marketplace/listings/:id/reviews — list reviews + replies
 */
export async function listReviews(listingId: string): Promise<ReviewListResponse> {
  return apiFetch<ReviewListResponse>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews`,
  );
}

/**
 * Backwards-compatible alias kept for code that imported the original name.
 */
export const listMarketplaceReviews = listReviews;

/**
 * POST /v1/marketplace/listings/:id/reviews — submit a new review
 *
 * Throws on validation errors (e.g. moderation spam rejection).
 */
export async function submitReview(
  listingId: string,
  payload: SubmitReviewInput,
): Promise<ReviewWithReply> {
  return apiFetch<ReviewWithReply>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

/**
 * POST /v1/marketplace/reviews/:id/replies — creator posts a single reply.
 * Server enforces one-reply-per-review; a second call returns 409.
 */
export async function replyToReview(reviewId: string, payload: ReplyInput): Promise<Reply> {
  return apiFetch<Reply>(`/v1/marketplace/reviews/${encodeURIComponent(reviewId)}/replies`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST /v1/marketplace/reviews/:id/helpful — toggle / increment helpful count.
 */
export async function markHelpful(reviewId: string): Promise<void> {
  await apiFetch<void>(`/v1/marketplace/reviews/${encodeURIComponent(reviewId)}/helpful`, {
    method: 'POST',
  });
}
