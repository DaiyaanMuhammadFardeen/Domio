'use client';

import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { Badge, type BadgeTone } from '../Badge';
import { replyToReview, type Reply } from '../../lib/review-service';
import type { ReviewWithListing } from '../../lib/review-service';

export interface CreatorReviewRowProps {
  review: ReviewWithListing;
  onReplied?: (reviewId: string, reply: Reply) => void;
}

function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case 'accepted':
      return 'green';
    case 'queued':
      return 'amber';
    case 'auto_flagged':
      return 'red';
    case 'removed':
      return 'red';
    default:
      return 'grey';
  }
}

function statusKey(status: string): string {
  switch (status) {
    case 'accepted':
      return 'reviews.status.accepted';
    case 'queued':
      return 'reviews.status.queued';
    case 'auto_flagged':
    case 'removed':
      return 'reviews.status.flagged';
    default:
      return status;
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${filled ? 'text-amber-400' : 'text-slate-300'}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function CreatorReviewRow({ review, onReplied }: CreatorReviewRowProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState(review.reply);

  const alreadyReplied = reply !== null;

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (body.trim().length === 0) {
      setError('Reply cannot be empty');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await replyToReview(review.id, { body: body.trim() });
      setReply({
        id: created.id,
        body: created.body,
        created_at: created.created_at,
      });
      setBody('');
      setOpen(false);
      onReplied?.(review.id, created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <tr className="align-top" data-testid={`creator-review-row-${review.id}`}>
      <td className="px-3 py-3 text-sm text-slate-800">{review.listing_title}</td>
      <td className="px-3 py-3 text-sm text-slate-700">
        {review.reviewer_name ?? review.reviewer_id}
      </td>
      <td className="px-3 py-3 text-sm">
        <div className="flex gap-0.5" aria-label={`${review.rating} of 5 stars`}>
          {Array.from({ length: 5 }).map((_star, i) => (
            <StarIcon key={`s-${review.id}-${i}`} filled={i < review.rating} />
          ))}
        </div>
      </td>
      <td className="max-w-md px-3 py-3 text-sm text-slate-700">
        <p className="leading-relaxed">{review.body}</p>
      </td>
      <td className="px-3 py-3">
        <Badge tone={toneForStatus(review.status)}>{t(statusKey(review.status))}</Badge>
      </td>
      <td className="px-3 py-3 text-sm">
        {alreadyReplied ? (
          <div>
            <Badge tone="green">{t('reviews.reply.alreadyReplied')}</Badge>
            <p className="mt-1 text-xs text-slate-500">{reply.body}</p>
          </div>
        ) : open ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-2"
            data-testid={`creator-review-reply-form-${review.id}`}
          >
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('reviews.reply.placeholder')}
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              data-testid={`creator-review-reply-body-${review.id}`}
            />
            {error && (
              <p
                className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
                data-testid={`creator-review-reply-error-${review.id}`}
              >
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                data-testid={`creator-review-reply-submit-${review.id}`}
              >
                {t('reviews.reply.replyNow')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-testid={`creator-review-reply-button-${review.id}`}
          >
            {t('reviews.reply.replyNow')}
          </button>
        )}
      </td>
    </tr>
  );
}

// Helper exported for parent page if it wants to format dates.
export const __formatDate = formatDate;
