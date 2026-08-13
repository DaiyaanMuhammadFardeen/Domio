'use client';

import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { Review } from '@/lib/types';
import type { ReviewWithReply, Reply } from '@/lib/review-service';
import { markHelpful } from '@/lib/review-service';
import { ReplyForm } from './ReplyForm';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${filled ? 'text-gold' : 'text-border'}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export interface ReviewListProps {
  reviews: ReadonlyArray<ReviewWithReply>;
  total: number;
  /** Optional — when the viewer is the listing creator, allow one reply per review. */
  currentUserId?: string;
  /** If the listing-creator ownership check has been resolved upstream. */
  isListingCreator?: boolean;
  /** Invoked after a reply is successfully submitted. */
  onReplyPosted?: (reviewId: string, reply: Reply) => void;
}

export function ReviewList({
  reviews,
  total,
  isListingCreator = false,
  onReplyPosted,
}: ReviewListProps) {
  const { t } = useLocale();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  if (reviews.length === 0) {
    return (
      <div className="py-8 text-center" data-testid="review-list-empty">
        <p className="text-sm text-muted">{t('market.review.empty')}</p>
      </div>
    );
  }

  async function handleHelpful(reviewId: string) {
    setBusy((b) => ({ ...b, [reviewId]: true }));
    try {
      await markHelpful(reviewId);
    } catch {
      /* swallow — vote failures are non-critical */
    } finally {
      setBusy((b) => ({ ...b, [reviewId]: false }));
    }
  }

  return (
    <div className="space-y-6" data-testid="review-list">
      <h3 className="font-display text-base font-semibold text-fg">
        {t('market.review.title')} ({total})
      </h3>

      <div className="space-y-4">
        {reviews.map((review) => (
          <article
            key={review.id}
            className="rounded-xl border border-border bg-surface p-4"
            data-testid={`review-item-${review.id}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5" aria-label={`${review.rating} of 5 stars`}>
                  {Array.from({ length: 5 }).map((_star, i) => (
                    <StarIcon key={`star-${review.id}-${i}`} filled={i < review.rating} />
                  ))}
                </div>
                {review.verified_buyer && (
                  <span
                    className="rounded bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success"
                    data-testid={`review-verified-${review.id}`}
                  >
                    {t('market.review.verified')}
                  </span>
                )}
              </div>
              <time
                className="text-xs text-muted"
                dateTime={new Date(review.created_at).toISOString()}
              >
                {formatDate(review.created_at)}
              </time>
            </div>

            <p className="text-sm leading-relaxed text-fg/80">{review.body}</p>

            {/* Helpful vote */}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleHelpful(review.id)}
                disabled={busy[review.id]}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1 text-xs font-medium text-fg/80 transition-colors hover:bg-panel disabled:opacity-50"
                data-testid={`review-helpful-${review.id}`}
              >
                {t('market.review.helpful')}
                {typeof review.helpful_count === 'number' && (
                  <span className="text-muted">{review.helpful_count}</span>
                )}
              </button>
            </div>

            {/* Creator reply — display + optional inline form */}
            {review.reply && (
              <div
                className="mt-4 rounded-lg border border-border/60 bg-bg p-3"
                data-testid={`review-reply-${review.id}`}
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t('market.review.reply.title')}
                </div>
                <p className="text-sm leading-relaxed text-fg/90">{review.reply.body}</p>
                <time
                  className="mt-1 block text-[11px] text-muted"
                  dateTime={new Date(review.reply.created_at).toISOString()}
                >
                  {formatDate(review.reply.created_at)}
                </time>
              </div>
            )}

            {isListingCreator && !review.reply && onReplyPosted && (
              <div className="mt-3">
                <ReplyForm
                  reviewId={review.id}
                  onSubmitted={(reply) => onReplyPosted(review.id, reply)}
                />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/** Re-export the simple shape for callers that still need Review[] typing. */
export type { Review };
