'use client';

/**
 * FillerWordCounter — counts filler phrases ("um", "uh", "like", …)
 * over a rehearsal window and shows their per-minute rate.
 *
 * Per Wave 6 §S6.7 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Pure presentational component. The parent AICoach derives counts
 * from the running transcript and passes them in.
 */

import { useMemo, type ReactElement } from 'react';

export interface FillerPhraseCount {
  phrase: string;
  count: number;
}

export interface FillerWordCounterProps {
  /** Phrase → count map for the entire rehearsal. */
  counts: readonly FillerPhraseCount[];
  /** Total elapsed ms of the rehearsal window. */
  elapsedMs: number;
  /** Optional override for the testid. */
  dataTestId?: string;
}

function minutesFromMs(ms: number): number {
  return Math.max(1, ms / 60_000);
}

function rateClass(rate: number): string {
  if (rate <= 2) return 'bg-emerald-500/15 text-emerald-300';
  if (rate <= 5) return 'bg-amber-500/15 text-amber-300';
  return 'bg-rose-500/15 text-rose-300';
}

function rateLabel(rate: number): string {
  if (rate <= 2) return 'On target';
  if (rate <= 5) return 'Watch';
  return 'High';
}

export function FillerWordCounter({
  counts,
  elapsedMs,
  dataTestId = 'filler-counter',
}: FillerWordCounterProps): ReactElement {
  const minutes = useMemo(() => minutesFromMs(elapsedMs), [elapsedMs]);
  const total = useMemo(
    () => counts.reduce((acc, c) => acc + c.count, 0),
    [counts],
  );
  const rate = total / minutes;

  // Stable order: highest count first, ties broken by phrase alphabetically.
  const sorted = useMemo(
    () =>
      [...counts].sort(
        (a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase),
      ),
    [counts],
  );

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
      data-testid={dataTestId}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className="text-2xl font-semibold tabular-nums text-slate-100"
            data-testid={`${dataTestId}-total`}
          >
            {total}
          </span>
          <span className="text-xs text-slate-400">fillers</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-sm tabular-nums text-slate-200"
            data-testid={`${dataTestId}-rate`}
          >
            {rate.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">/ min</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rateClass(rate)}`}
            data-testid={`${dataTestId}-band`}
          >
            {rateLabel(rate)}
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p
          className="text-xs text-slate-500"
          data-testid={`${dataTestId}-empty`}
        >
          No filler words detected yet.
        </p>
      ) : (
        <ul
          className="flex flex-col gap-1"
          data-testid={`${dataTestId}-list`}
        >
          {sorted.map((c) => (
            <li
              key={c.phrase}
              className="flex items-center justify-between rounded px-2 py-1 text-xs"
              data-testid={`${dataTestId}-row-${c.phrase}`}
            >
              <span className="text-slate-200">&ldquo;{c.phrase}&rdquo;</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-slate-300">{c.count}</span>
                <span className="w-12 text-right text-[10px] text-slate-500">
                  {(c.count / minutes).toFixed(1)}/m
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}