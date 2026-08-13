'use client';

/**
 * LiveSlideView — current slide + time-in-slide.
 *
 * Per Wave 7 §S7.7 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Renders a single primary tile showing the current slide index,
 * time spent on the slide, and total-slide count. Updates from the
 * live HUD's snapshot.
 */

import { type ReactElement } from 'react';
import { Layers, Timer } from 'lucide-react';
import type { LiveSlideState } from '../lib/live-analytics-service';

export interface LiveSlideViewProps {
  slide: LiveSlideState;
  sessionId: string;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function LiveSlideView({ slide, sessionId }: LiveSlideViewProps): ReactElement {
  const index = slide.slideIndex;
  const total = slide.totalSlides;
  const slideLabel =
    slide.slideId != null
      ? `Slide ${index != null ? index + 1 : '?'}${total != null ? ` / ${total}` : ''}`
      : 'Awaiting next slide…';

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="live-slide-view"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Current slide
        </h2>
        <span className="text-xs text-slate-500">{sessionId}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{slideLabel}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-1 text-slate-500">
            <Timer className="h-3 w-3" aria-hidden /> Time on slide
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {formatMs(slide.timeInSlideMs)}
          </div>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-1 text-slate-500">
            <Layers className="h-3 w-3" aria-hidden /> Slide id
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-700">
            {slide.slideId ?? '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
