/**
 * @domio/join-web — Sentiment widget.
 *
 * Mobile-first: 3-button scale (positive / neutral / negative) with
 * current aggregate (positive/neutral/negative counts).
 */

'use client';

import { useMemo, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface SentimentPayload {
  readonly prompt?: string;
}

type SentimentValue = 'positive' | 'neutral' | 'negative';

interface SentimentState {
  readonly tally?: Record<SentimentValue, number>;
}

const BUTTONS: ReadonlyArray<{ value: SentimentValue; label: string; emoji: string; tone: string }> = [
  { value: 'positive', label: 'Positive', emoji: '😀', tone: 'bg-green-100 hover:bg-green-200' },
  { value: 'neutral', label: 'Neutral', emoji: '�', tone: 'bg-slate-100 hover:bg-slate-200' },
  { value: 'negative', label: 'Negative', emoji: '😟', tone: 'bg-red-100 hover:bg-red-200' },
];

export function SentimentInner(props: WidgetProps<SentimentPayload>) {
  const [pick, setPick] = useState<SentimentValue | null>(null);
  const [localTally, setLocalTally] = useState<Record<SentimentValue, number>>({
    positive: 0,
    neutral: 0,
    negative: 0,
  });

  const state = (props.state as SentimentState | null) ?? null;
  const tally = useMemo<Record<SentimentValue, number>>(() => {
    const base: Record<SentimentValue, number> = { ...localTally };
    if (state?.tally) {
      for (const k of Object.keys(state.tally) as SentimentValue[]) {
        base[k] = (base[k] ?? 0) + (state.tally[k] ?? 0);
      }
    }
    return base;
  }, [localTally, state?.tally]);

  const handle = (value: SentimentValue): void => {
    if (props.disabled || pick !== null) return;
    setPick(value);
    setLocalTally((t) => ({ ...t, [value]: t[value] + 1 }));
    props.onSubmit?.({ sentiment: value });
  };

  const total = tally.positive + tally.neutral + tally.negative;

  return (
    <WidgetCard label="How is it going?" testIdPrefix="sentiment">
      {props.payload.prompt ? (
        <p className="text-sm text-slate-700 mb-2" data-testid="sentiment-prompt">
          {props.payload.prompt}
        </p>
      ) : null}
      <div className="flex justify-between gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.value}
            type="button"
            className={`flex-1 min-h-[44px] p-3 rounded border disabled:opacity-50 ${b.tone}`}
            disabled={props.disabled || pick !== null}
            onClick={() => handle(b.value)}
            data-testid={`sentiment-${b.value}`}
          >
            <span className="block text-2xl" aria-hidden>
              {b.emoji}
            </span>
            <span className="block text-xs">{b.label}</span>
          </button>
        ))}
      </div>
      <div
        className="mt-3 flex justify-between text-xs text-slate-600"
        data-testid="sentiment-tally"
      >
        {BUTTONS.map((b) => (
          <span key={b.value} data-testid={`sentiment-count-${b.value}`}>
            {b.label}: {tally[b.value]}
            {total > 0 ? ` (${Math.round((tally[b.value] / total) * 100)}%)` : ''}
          </span>
        ))}
      </div>
    </WidgetCard>
  );
}

export const Sentiment: WidgetComponent = {
  type: 'sentiment',
  Component: SentimentInner as WidgetComponent['Component'],
};