'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { listCreatorReviews, type ReviewWithListing, type Reply } from '../../lib/review-service';
import { CreatorReviewRow } from '../../components/reviews/CreatorReviewRow';

const WORKSPACE_ID =
  process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';

export default function CreatorReviewsPage() {
  const { t } = useI18n();
  const [reviews, setReviews] = useState<ReadonlyArray<ReviewWithListing> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listCreatorReviews(WORKSPACE_ID).then((rows) => {
      if (!cancelled) {
        setReviews(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleReplied(reviewId: string, reply: Reply) {
    setReviews((prev) =>
      prev
        ? prev.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  reply: {
                    id: reply.id,
                    body: reply.body,
                    created_at: reply.created_at,
                  },
                }
              : r,
          )
        : prev,
    );
  }

  return (
    <div data-testid="creator-reviews-page" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('reviews.heading')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('reviews.subheading')}
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">
          Loading…
        </div>
      ) : reviews === null || reviews.length === 0 ? (
        <div
          className="rounded-xl border border-slate-200 bg-white p-12 text-center"
          data-testid="creator-reviews-empty"
        >
          <p className="text-sm text-slate-600">{t('reviews.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.listing')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.reviewer')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.rating')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.body')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.status')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('reviews.col.replyState')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map((r) => (
                <CreatorReviewRow
                  key={r.id}
                  review={r}
                  onReplied={handleReplied}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
