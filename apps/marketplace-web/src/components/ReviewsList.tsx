'use client';

import { useLocale } from '@/hooks/useLocale';
import type { Review } from '@/lib/types';

interface ReviewsListProps {
  reviews: Review[];
  total: number;
}

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

export function ReviewsList({ reviews, total }: ReviewsListProps) {
  const { t } = useLocale();

  if (reviews.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">{t('detail.reviewsCount', { count: 0 })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="font-display text-base font-semibold text-fg">
        {t('detail.reviewsCount', { count: total })}
      </h3>

      <div className="space-y-4">
        {reviews.map((review) => (
          <article key={review.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_star, i) => (
                    <StarIcon key={`star-${review.id}-${i}`} filled={i < review.rating} />
                  ))}
                </div>
                {review.verified_buyer && (
                  <span className="rounded bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    Verified buyer
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
          </article>
        ))}
      </div>
    </div>
  );
}
