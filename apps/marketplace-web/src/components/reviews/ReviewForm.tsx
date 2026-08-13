'use client';

import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { submitReview, type ReviewWithReply } from '@/lib/review-service';

export interface ReviewFormProps {
  listingId: string;
  /** Called after a successful submit so the parent can refresh the list. */
  onSubmitted?: (review: ReviewWithReply) => void;
}

export function ReviewForm({ listingId, onSubmitted }: ReviewFormProps) {
  const { t } = useLocale();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) {
      setError('Please choose a rating');
      return;
    }
    if (body.trim().length === 0) {
      setError('Please write a review');
      return;
    }
    setSubmitting(true);
    try {
      const created = await submitReview(listingId, { rating, body: body.trim() });
      setSuccess(true);
      setRating(0);
      setBody('');
      onSubmitted?.(created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/spam|moderation|flagged/i.test(msg)) {
        setError(t('market.review.form.error.spam'));
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      data-testid="review-form"
    >
      <h4 className="font-display text-sm font-semibold text-fg">
        {t('market.review.form.title')}
      </h4>

      {/* Star picker */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-muted">
          {t('market.review.form.rating')}
        </label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t('market.review.form.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5 transition-transform hover:scale-110"
              data-testid={`review-star-${n}`}
            >
              <svg
                className={`h-6 w-6 ${
                  n <= (hover || rating) ? 'text-gold' : 'text-border'
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1">
        <label
          htmlFor="review-body"
          className="block text-xs font-medium text-muted"
        >
          {t('market.review.form.body')}
        </label>
        <textarea
          id="review-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg p-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          data-testid="review-body"
        />
      </div>

      {error && (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
          data-testid="review-form-error"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700"
          data-testid="review-form-success"
        >
          {t('market.review.form.success')}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          data-testid="review-form-submit"
        >
          {submitting
            ? t('market.review.form.submitting')
            : t('market.review.form.submit')}
        </button>
      </div>
    </form>
  );
}
