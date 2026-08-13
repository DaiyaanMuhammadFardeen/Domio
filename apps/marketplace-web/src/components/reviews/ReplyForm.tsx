'use client';

import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { replyToReview, type Reply } from '@/lib/review-service';

export interface ReplyFormProps {
  reviewId: string;
  /** Called after a successful reply submit. */
  onSubmitted?: (reply: Reply) => void;
}

/**
 * Inline form a creator uses to post a single reply to a review.
 * After submit, the form is hidden and a success state is shown
 * (one-reply-only enforcement is server-side).
 */
export function ReplyForm({ reviewId, onSubmitted }: ReplyFormProps) {
  const { t } = useLocale();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    if (body.trim().length === 0) {
      setError('Please write a reply');
      return;
    }
    setSubmitting(true);
    try {
      const reply = await replyToReview(reviewId, { body: body.trim() });
      setDone(true);
      setBody('');
      onSubmitted?.(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p
        className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700"
        data-testid={`reply-success-${reviewId}`}
      >
        {t('market.review.reply.success')}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-lg border border-border bg-bg p-3"
      data-testid={`reply-form-${reviewId}`}
    >
      <label
        htmlFor={`reply-body-${reviewId}`}
        className="block text-xs font-medium text-muted"
      >
        {t('market.review.reply.title')}
      </label>
      <textarea
        id={`reply-body-${reviewId}`}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('market.review.reply.placeholder')}
        className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        data-testid={`reply-body-${reviewId}`}
      />

      {error && (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
          data-testid={`reply-error-${reviewId}`}
        >
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          data-testid={`reply-submit-${reviewId}`}
        >
          {t('market.review.reply.submit')}
        </button>
      </div>
    </form>
  );
}
