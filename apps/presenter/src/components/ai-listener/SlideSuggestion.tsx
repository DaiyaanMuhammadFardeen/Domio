'use client';

/**
 * SlideSuggestion — popover that appears when a question is matched.
 *
 * Per Wave 11 §S11.10. Displays the recognized question, the suggested
 * slide (thumbnail + title + relevance), and Jump to slide / Dismiss
 * actions.
 */

import { useCallback } from 'react';
import type { MatchedQuestion } from '../../lib/ai-listener-service';

export interface SlideSuggestionProps {
  match: MatchedQuestion;
  thumbnailUrl?: string;
  onJump: (match: MatchedQuestion) => void;
  onDismiss: (match: MatchedQuestion) => void;
}

export function SlideSuggestion({
  match,
  thumbnailUrl,
  onJump,
  onDismiss,
}: SlideSuggestionProps) {
  const handleJump = useCallback(() => {
    onJump(match);
  }, [match, onJump]);

  const handleDismiss = useCallback(() => {
    onDismiss(match);
  }, [match, onDismiss]);

  const relevancePct = Math.round((match.relevance ?? 0) * 100);

  return (
    <div
      role="dialog"
      aria-label="Slide suggestion"
      data-testid="slide-suggestion"
      data-match-id={match.id}
      className="w-80 rounded-lg border border-emerald-300 bg-white p-4 shadow-lg"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Did someone ask…
      </div>
      <div
        className="mb-3 text-sm text-zinc-700"
        data-testid="slide-suggestion-question"
      >
        Heard: &ldquo;{match.question}&rdquo;
      </div>
      <div className="mb-3 flex items-start gap-3">
        <div
          aria-hidden="true"
          data-testid="slide-suggestion-thumb"
          className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-[10px] text-zinc-500"
          style={
            thumbnailUrl
              ? {
                  backgroundImage: `url(${thumbnailUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          {!thumbnailUrl ? 'slide' : ''}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium text-zinc-900"
            data-testid="slide-suggestion-title"
            title={match.slide_title}
          >
            Suggested slide: {match.slide_title}
          </div>
          <div
            className="mt-1 text-xs text-zinc-500"
            data-testid="slide-suggestion-relevance"
          >
            Relevance: {relevancePct}%
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          data-testid="slide-suggestion-dismiss"
          className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={handleJump}
          data-testid="slide-suggestion-jump"
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Jump to slide
        </button>
      </div>
    </div>
  );
}
