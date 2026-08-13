'use client';

/**
 * PaceTracker — live WPM gauge for rehearsal.
 *
 * Per Wave 6 §S6.7 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Renders the current words-per-minute value as a horizontal gauge
 * with a band (slow / on-target / fast) derived from the target WPM.
 * The component is purely presentational — pace data is supplied by
 * the parent AICoach, which derives it from the running transcript.
 */

import { useMemo, type ReactElement } from 'react';

export interface PaceTrackerProps {
  /** Current words-per-minute value. */
  wpm: number;
  /** Target WPM (default 150). */
  targetWpm?: number;
  /** Tolerance (±wpm) before flagging as off-pace. */
  toleranceWpm?: number;
  /** Optional override for the testid. */
  dataTestId?: string;
}

const MIN_WPM = 0;
const MAX_WPM = 250;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function paceLabel(
  wpm: number,
  target: number,
  tolerance: number,
): {
  band: 'slow' | 'on-target' | 'fast';
  text: string;
} {
  if (wpm < target - tolerance) return { band: 'slow', text: 'Slow' };
  if (wpm > target + tolerance) return { band: 'fast', text: 'Fast' };
  return { band: 'on-target', text: 'On target' };
}

function bandClass(band: 'slow' | 'on-target' | 'fast'): string {
  switch (band) {
    case 'slow':
      return 'bg-amber-500/15 text-amber-300';
    case 'fast':
      return 'bg-rose-500/15 text-rose-300';
    case 'on-target':
      return 'bg-emerald-500/15 text-emerald-300';
  }
}

function barFillClass(band: 'slow' | 'on-target' | 'fast'): string {
  switch (band) {
    case 'slow':
      return 'bg-amber-400';
    case 'fast':
      return 'bg-rose-400';
    case 'on-target':
      return 'bg-emerald-400';
  }
}

export function PaceTracker({
  wpm,
  targetWpm = 150,
  toleranceWpm = 20,
  dataTestId = 'pace-tracker',
}: PaceTrackerProps): ReactElement {
  const { band, text } = useMemo(
    () => paceLabel(wpm, targetWpm, toleranceWpm),
    [wpm, targetWpm, toleranceWpm],
  );

  // Normalize into the [0..MAX_WPM] range for the fill bar.
  const pct = clamp((clamp(wpm, MIN_WPM, MAX_WPM) / MAX_WPM) * 100, 0, 100);
  const targetPct = clamp((targetWpm / MAX_WPM) * 100, 0, 100);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
      data-testid={dataTestId}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className="text-2xl font-semibold tabular-nums text-slate-100"
            data-testid={`${dataTestId}-value`}
          >
            {Math.round(wpm)}
          </span>
          <span className="text-xs text-slate-400">wpm</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${bandClass(band)}`}
          data-testid={`${dataTestId}-band`}
        >
          {text}
        </span>
      </div>

      <div
        className="relative h-2 overflow-hidden rounded-full bg-slate-700/60"
        data-testid={`${dataTestId}-bar`}
        role="meter"
        aria-valuenow={Math.round(wpm)}
        aria-valuemin={MIN_WPM}
        aria-valuemax={MAX_WPM}
      >
        <div
          className={`h-full transition-all ${barFillClass(band)}`}
          style={{ width: `${pct}%` }}
          data-testid={`${dataTestId}-fill`}
        />
        <div
          className="absolute top-0 h-full w-px bg-slate-300/80"
          style={{ left: `${targetPct}%` }}
          aria-hidden="true"
          data-testid={`${dataTestId}-target`}
        />
      </div>

      <div className="flex justify-between text-[10px] text-slate-500">
        <span>0</span>
        <span>target {targetWpm}</span>
        <span>{MAX_WPM}+</span>
      </div>
    </div>
  );
}
