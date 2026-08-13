'use client';

/**
 * EyeContactMeter — 0–100% bar of webcam-facing eye contact.
 *
 * Per Wave 6 §S6.7 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * TODO: integrate MediaPipe face mesh via WebAssembly — the
 * production version should run MediaPipe's FaceMesh graph on each
 * webcam frame, score whether the iris vector points at the camera,
 * and aggregate the score over the rehearsal window. For now the
 * component accepts a pre-computed 0–100 score so the rest of the
 * pipeline (gauge → coach → API) can be built and tested.
 */

import { useMemo, type ReactElement } from 'react';

export interface EyeContactMeterProps {
  /** 0–100 score: percentage of frames the presenter looked at the camera. */
  score: number;
  /** Optional override for the testid. */
  dataTestId?: string;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function band(score: number): { label: string; className: string; barClass: string } {
  if (score >= 70) return { label: 'Strong', className: 'bg-emerald-500/15 text-emerald-300', barClass: 'bg-emerald-400' };
  if (score >= 40) return { label: 'Mixed', className: 'bg-amber-500/15 text-amber-300', barClass: 'bg-amber-400' };
  return { label: 'Low', className: 'bg-rose-500/15 text-rose-300', barClass: 'bg-rose-400' };
}

export function EyeContactMeter({
  score,
  dataTestId = 'eye-contact-meter',
}: EyeContactMeterProps): ReactElement {
  const pct = clampPct(score);
  const { label, className, barClass } = useMemo(() => band(pct), [pct]);

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
            {pct}%
          </span>
          <span className="text-xs text-slate-400">eye contact</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
          data-testid={`${dataTestId}-band`}
        >
          {label}
        </span>
      </div>

      <div
        className="relative h-2 overflow-hidden rounded-full bg-slate-700/60"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid={`${dataTestId}-bar`}
      >
        <div
          className={`h-full transition-all ${barClass}`}
          style={{ width: `${pct}%` }}
          data-testid={`${dataTestId}-fill`}
        />
      </div>

      <p
        className="text-[10px] leading-snug text-slate-500"
        data-testid={`${dataTestId}-note`}
      >
        {/* TODO: integrate MediaPipe face mesh via WebAssembly. */}
        Face-mesh detection stubbed; the score is supplied by the rehearsal coach.
      </p>
    </div>
  );
}