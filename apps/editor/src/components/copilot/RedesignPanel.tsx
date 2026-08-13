'use client';

/**
 * RedesignPanel — selected slide redesign surface (Wave 6 §S6.3).
 *
 * Flow:
 *   1. A slide is selected (host passes `selectedSlide`).
 *   2. User picks light or full mode.
 *   3. Click "Redesign" → POST /v1/ai/designer/redesign.
 *   4. The returned redesign replaces the slide content via the
 *      `onApplyRedesign` callback (host wires this to the deck).
 *
 * Brand-lock is surfaced: every redesign result carries `brandLocked: true`
 * so the UI can render an explicit guarantee.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { LayoutPreviewGrid } from './LayoutPreviewGrid';
import {
  redesignSlide,
  type LayoutDescriptor,
  type RedesignMode,
  type RedesignResult,
} from '../../lib/designer-service';
import { useT } from '../../lib/locale';

export interface SelectedSlide {
  readonly id: string;
  readonly title: string;
  readonly blocks?: readonly string[];
}

export interface RedesignPanelProps {
  readonly selectedSlide: SelectedSlide | null;
  /** Called when the user applies the redesign — host swaps slide content. */
  readonly onApplyRedesign?: (redesign: RedesignResult) => void;
  /** Optional theme id to pass through. */
  readonly themeId?: string;
  /** Optional brand kit id to pass through. */
  readonly brandKitId?: string;
}

function toLayoutDescriptor(r: RedesignResult): LayoutDescriptor {
  return {
    id: r.redesign.id,
    kind: r.redesign.kind,
    title: r.redesign.title,
    caption: r.redesign.caption,
    blocks: r.redesign.blocks,
    dataFocus: r.redesign.kind === 'data-focus' || r.redesign.kind === 'chart-with-caption',
    accentSlot: 'top',
  };
}

export function RedesignPanel({
  selectedSlide,
  onApplyRedesign,
  themeId,
  brandKitId,
}: RedesignPanelProps): ReactElement {
  const t = useT();
  const [mode, setMode] = useState<RedesignMode>('light');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const handleRedesign = useCallback(async () => {
    if (!selectedSlide) return;
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      const r = await redesignSlide({
        slideId: selectedSlide.id,
        mode,
        ...(themeId ? { themeId } : {}),
        ...(brandKitId ? { brandKitId } : {}),
        ...(selectedSlide.blocks ? { currentContent: selectedSlide.blocks } : {}),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redesign request failed');
    } finally {
      setLoading(false);
    }
  }, [selectedSlide, mode, themeId, brandKitId]);

  const handleApply = useCallback(() => {
    if (!result) return;
    setApplied(true);
    onApplyRedesign?.(result);
  }, [result, onApplyRedesign]);

  return (
    <div className="flex h-full flex-col" data-testid="redesign-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
        <RefreshCw size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">
          {t('s63.redesign.title')}
        </h2>
        {result?.brandLocked && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
            data-testid="redesign-brand-locked"
          >
            <ShieldCheck size={10} />
            {t('s63.redesign.brandLocked')}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Selected slide summary */}
        {selectedSlide ? (
          <div
            className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
            data-testid="redesign-selected-slide"
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t('s63.redesign.selectedLabel')}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {selectedSlide.title}
            </div>
            {selectedSlide.blocks && selectedSlide.blocks.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-slate-400">
                {selectedSlide.blocks.slice(0, 4).map((b, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-slate-600" />
                    <span className="truncate">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div
            className="rounded-md border border-dashed border-slate-700/60 bg-slate-800/30 px-4 py-6 text-center text-xs text-slate-500"
            data-testid="redesign-empty"
          >
            {t('s63.redesign.emptyHint')}
          </div>
        )}

        {/* Mode selector */}
        <div
          className="mt-4 flex rounded-md bg-slate-900/60 p-0.5"
          role="radiogroup"
          aria-label={t('s63.redesign.modeLabel')}
          data-testid="redesign-mode-group"
        >
          {(['light', 'full'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-all ${
                mode === m
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              data-testid={`redesign-mode-${m}`}
            >
              {t(`s63.redesign.mode.${m}`)}
            </button>
          ))}
        </div>

        {/* Redesign button */}
        <button
          type="button"
          onClick={() => void handleRedesign()}
          disabled={!selectedSlide || loading}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
          data-testid="redesign-btn"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? t('s63.redesign.redesigning') : t('s63.redesign.btn')}
        </button>

        {/* Error */}
        {error && (
          <div
            className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            data-testid="redesign-error"
          >
            {error}
          </div>
        )}

        {/* Result preview */}
        {result && (
          <div className="mt-4 flex flex-col gap-2" data-testid="redesign-result">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">
                {t('s63.redesign.previewHeading')}
              </h3>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                {result.theme.name} · {result.mode}
              </span>
            </div>
            <LayoutPreviewGrid
              layout={toLayoutDescriptor(result)}
              onApply={handleApply}
              selected={applied}
            />
            {applied && (
              <div
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300"
                data-testid="redesign-applied-confirm"
              >
                {t('s63.redesign.applied')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}