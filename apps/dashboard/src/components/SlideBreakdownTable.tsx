'use client';

/**
 * SlideBreakdownTable — per-slide bounce + "why?" button.
 *
 * Per Wave 7 §S7.2 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Each row exposes a "why?" button that triggers an AI-hypothesis
 * lookup for the slide. The hypotheses are rendered inline once the
 * request resolves (or shown as an empty state if the upstream is
 * unreachable).
 */

import { useState, type ReactElement } from 'react';
import { clsx } from 'clsx';
import { fetchWhyHypotheses, type SlideBreakdown } from '../lib/funnel-service';

export interface SlideBreakdownTableProps {
  slides: ReadonlyArray<SlideBreakdown>;
  deckId: string;
  workspaceId: string;
  /** Drop a slide from the rendered list when this returns true. */
  filter?: (slide: SlideBreakdown) => boolean;
  /** Test seam for the why? hypothesis lookup. */
  hypothesisFetcher?: typeof fetchWhyHypotheses;
}

interface HypothesisState {
  status: 'idle' | 'loading' | 'done' | 'error';
  summary?: string;
  items?: ReadonlyArray<string>;
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value / 1000).toFixed(1)} s`;
}

export function SlideBreakdownTable({
  slides,
  deckId,
  workspaceId,
  filter,
  hypothesisFetcher = fetchWhyHypotheses,
}: SlideBreakdownTableProps): ReactElement {
  const [hypothesisBySlide, setHypothesisBySlide] = useState<
    Record<string, HypothesisState>
  >({});

  const visible = filter ? slides.filter(filter) : slides;

  async function loadWhy(slideId: string) {
    setHypothesisBySlide((prev) => ({
      ...prev,
      [slideId]: { status: 'loading' },
    }));
    try {
      const result = await hypothesisFetcher(workspaceId, deckId, slideId);
      if (!result) {
        setHypothesisBySlide((prev) => ({
          ...prev,
          [slideId]: { status: 'error' },
        }));
        return;
      }
      setHypothesisBySlide((prev) => ({
        ...prev,
        [slideId]: {
          status: 'done',
          summary: result.summary,
          items: result.hypotheses,
        },
      }));
    } catch {
      setHypothesisBySlide((prev) => ({
        ...prev,
        [slideId]: { status: 'error' },
      }));
    }
  }

  if (visible.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
        role="status"
        data-testid="slide-breakdown-empty"
      >
        No slide-level data for this deck.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left">Slide</th>
            <th className="px-4 py-2 text-left">Title</th>
            <th className="px-4 py-2 text-right">Viewers</th>
            <th className="px-4 py-2 text-right">Bounce</th>
            <th className="px-4 py-2 text-right">Avg dwell</th>
            <th className="px-4 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visible.map((slide) => {
            const hyp = hypothesisBySlide[slide.slideId];
            const expanded = hyp?.status === 'done';
            return (
              <SlideRow
                key={slide.slideId}
                slide={slide}
                hyp={hyp}
                expanded={expanded}
                onWhy={() => void loadWhy(slide.slideId)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SlideRowProps {
  slide: SlideBreakdown;
  hyp: HypothesisState | undefined;
  expanded: boolean;
  onWhy: () => void;
}

function SlideRow({ slide, hyp, expanded, onWhy }: SlideRowProps): ReactElement {
  const isLoading = hyp?.status === 'loading';
  const isError = hyp?.status === 'error';
  return (
    <>
      <tr data-testid={`slide-row-${slide.slideId}`}>
        <td className="px-4 py-2 font-mono text-xs text-slate-700">#{slide.index + 1}</td>
        <td className="px-4 py-2 text-slate-800">{slide.title ?? 'Untitled'}</td>
        <td className="px-4 py-2 text-right tabular-nums">{slide.viewers.toLocaleString()}</td>
        <td className="px-4 py-2 text-right tabular-nums">
          <span
            className={clsx(
              'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
              slide.bounceRate >= 0.5
                ? 'bg-rose-50 text-rose-700'
                : slide.bounceRate >= 0.3
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700',
            )}
          >
            {pct(slide.bounceRate)}
          </span>
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{ms(slide.avgDwellMs)}</td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={onWhy}
            disabled={isLoading}
            data-testid={`slide-why-${slide.slideId}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
          >
            {isLoading ? '…' : 'why?'}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr data-testid={`slide-why-detail-${slide.slideId}`}>
          <td colSpan={6} className="bg-slate-50 px-4 py-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {hyp?.summary ?? 'Hypotheses'}
              </p>
              <ul className="list-inside list-disc text-xs text-slate-600">
                {(hyp?.items ?? []).map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      ) : null}
      {isError ? (
        <tr data-testid={`slide-why-error-${slide.slideId}`}>
          <td colSpan={6} className="bg-rose-50 px-4 py-2 text-xs text-rose-700">
            Could not load hypotheses. The warehouse is unreachable.
          </td>
        </tr>
      ) : null}
    </>
  );
}