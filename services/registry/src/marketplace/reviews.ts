import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { Errors } from '../errors.js';
import { uuid } from '../crypto/index.js';
import type { Review } from '../store/types.js';

const PROFANITY: readonly string[] = [
  'scam', 'fraud', 'fuck', 'shit', 'asshole', 'bastard', 'bitch', 'idiot', 'stupid', 'terrible', 'useless',
];

export type ModerationVerdict = 'approved' | 'auto_flagged' | 'rejected';

export interface ModerationScore {
  profanityHits: string[];
  linkDensity: number;
  capsRatio: number;
  repetitionScore: number;
  gibberish: boolean;
  trustScore: number;
  verdict: ModerationVerdict;
}

/** Heuristic moderation scoring for review bodies. */
export function scoreReview(
  text: string,
  opts: { reviewerTrust?: number | undefined; isVerified?: boolean | undefined } = {},
): ModerationScore {
  const lower = text.toLowerCase();
  const profanityHits = PROFANITY.filter((w) => lower.includes(w));
  const words = text.split(/\s+/).filter(Boolean);
  const urls = (text.match(/https?:\/\/\S+/g) ?? []).length;
  const linkDensity = words.length > 0 ? urls / words.length : 0;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  const caps = text.replace(/[^A-Z]/g, '');
  const capsRatio = letters.length > 0 ? caps.length / letters.length : 0;
  const unique = new Set(words.map((t) => t.toLowerCase()));
  const repetitionScore = words.length > 0 ? 1 - unique.size / words.length : 0;
  const gibberish = words.length > 2 && unique.size <= 2;

  const base = opts.isVerified ? 0.8 : 0.5;
  const trustScore = Math.max(
    0,
    Math.min(
      1,
      base +
        (opts.reviewerTrust ?? 0) -
        profanityHits.length * 0.3 -
        linkDensity * 0.5 -
        capsRatio * 0.2 -
        repetitionScore * 0.3 -
        (gibberish ? 0.5 : 0),
    ),
  );

  let verdict: ModerationVerdict = 'approved';
  if (profanityHits.length > 0 || gibberish) verdict = 'auto_flagged';
  if (linkDensity > 0.4 || capsRatio > 0.6) verdict = 'auto_flagged';
  if (trustScore >= 0.6) verdict = 'approved';
  if (trustScore < 0.25) verdict = 'rejected';

  return {
    profanityHits,
    linkDensity,
    capsRatio,
    repetitionScore,
    gibberish,
    trustScore: Math.round(trustScore * 100) / 100,
    verdict,
  };
}

/** Map a moderation verdict to the stored review status. */
export function verdictToStatus(verdict: ModerationVerdict): Review['status'] {
  switch (verdict) {
    case 'approved':
      return 'accepted';
    case 'auto_flagged':
      return 'auto_flagged';
    case 'rejected':
      return 'removed';
  }
}

export interface SubmitReviewInput {
  listingId: string;
  reviewerId: string;
  rating: number;
  body: string;
  verifiedBuyer?: boolean;
}

export async function submitReview(deps: ServiceDeps, input: SubmitReviewInput): Promise<Review> {
  const listing = await deps.store.getListing(input.listingId);
  if (!listing) throw Errors.notFound(`listing ${input.listingId}`);
  if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
    throw Errors.validation('rating must be an integer 1-5');
  }
  const score = scoreReview(input.body, { isVerified: input.verifiedBuyer });

  const review: Review = {
    id: uuid(),
    listingId: input.listingId,
    reviewerId: input.reviewerId,
    rating: input.rating,
    body: input.body,
    status: verdictToStatus(score.verdict),
    verifiedBuyer: input.verifiedBuyer ?? false,
    createdAt: nowMs(deps),
  };
  await deps.store.putReview(review);
  if (review.status === 'auto_flagged') {
    throw Errors.moderationQueued('Review queued for moderation');
  }
  return review;
}

/** Aggregate review stats for a listing (approved reviews only). */
export async function listingReviewStats(
  deps: ServiceDeps,
  listingId: string,
): Promise<{ rating: number; count: number }> {
  const reviews = await deps.store.listReviews(listingId, 'accepted');
  const rating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;
  return { rating, count: reviews.length };
}

/** Moderation worker entry: drain the auto-flagged queue (approve or keep for human review). */
export async function runModerationQueue(deps: ServiceDeps): Promise<number> {
  const queued = await deps.store.listReviewsByStatus('auto_flagged');
  let processed = 0;
  for (const review of queued) {
    const score = scoreReview(review.body, { isVerified: review.verifiedBuyer });
    if (score.verdict === 'rejected') {
      await deps.store.putReview({ ...review, status: 'removed' });
    } else {
      await deps.store.putReview({ ...review, status: 'accepted' });
    }
    processed += 1;
  }
  return processed;
}
