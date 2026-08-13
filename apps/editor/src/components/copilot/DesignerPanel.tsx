'use client';

/**
 * DesignerPanel — AI slide designer surface (Wave 6 §S6.3).
 *
 * Flow:
 *   1. User types a prompt.
 *   2. Click Generate → POST /v1/ai/designer/layouts (via designer-service).
 *   3. 4 layout previews render via LayoutPreviewGrid.
 *   4. Click "Apply" on any preview → handler inserts that layout as a
 *      slide. The actual insertion happens in the editor; this panel
 *      surfaces a callback the host can wire.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { LayoutPreviewGrid } from './LayoutPreviewGrid';
import {
  generateLayouts,
  type LayoutDescriptor,
  type GenerateLayoutsResult,
} from '../../lib/designer-service';
import { useT } from '../../lib/locale';

export interface DesignerPanelProps {
  /**
   * Host-provided hook called when the user applies a layout. Receives
   * the layout descriptor so the editor can convert it into a slide
   * (e.g. by mapping kind → template + inserting into the deck).
   */
  readonly onApplyLayout?: (layout: LayoutDescriptor) => void;
  /** Optional theme id to pass through to the service. */
  readonly themeId?: string;
  /** Optional brand kit id to pass through to the service. */
  readonly brandKitId?: string;
}

export function DesignerPanel({
  onApplyLayout,
  themeId,
  brandKitId,
}: DesignerPanelProps): ReactElement {
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateLayoutsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setAppliedId(null);
    try {
      const r = await generateLayouts({
        prompt: trimmed,
        ...(themeId ? { themeId } : {}),
        ...(brandKitId ? { brandKitId } : {}),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Designer request failed');
    } finally {
      setLoading(false);
    }
  }, [prompt, themeId, brandKitId]);

  const handleApply = useCallback(
    (id: string) => {
      const layout = result?.layouts.find((l) => l.id === id);
      if (!layout) return;
      setAppliedId(id);
      onApplyLayout?.(layout);
    },
    [result, onApplyLayout],
  );

  return (
    <div className="flex h-full flex-col" data-testid="designer-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
        <Wand2 size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">{t('s63.designer.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Prompt input */}
        <div className="flex flex-col gap-2">
          <label htmlFor="designer-prompt-input" className="text-xs font-medium text-slate-400">
            {t('s63.designer.promptLabel')}
          </label>
          <textarea
            id="designer-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleGenerate();
              }
            }}
            placeholder={t('s63.designer.promptPlaceholder')}
            rows={3}
            className="resize-none rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50"
            aria-label={t('s63.designer.promptLabel')}
            data-testid="designer-prompt-input"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">{t('s63.designer.shortcutHint')}</span>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim() || loading}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
              data-testid="designer-generate-btn"
            >
              <Sparkles size={14} />
              {loading ? t('s63.designer.generating') : t('s63.designer.generateBtn')}
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div
            className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            data-testid="designer-error"
          >
            {error}
          </div>
        )}

        {/* Layout previews */}
        {result && (
          <div className="mt-4 flex flex-col gap-2" data-testid="designer-results">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">
                {t('s63.designer.optionsHeading')}
              </h3>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                {result.theme.name} · {result.layouts.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {result.layouts.map((layout) => (
                <LayoutPreviewGrid
                  key={layout.id}
                  layout={layout}
                  selected={appliedId === layout.id}
                  onApply={handleApply}
                />
              ))}
            </div>
            {appliedId && (
              <div
                className="mt-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300"
                data-testid="designer-applied-confirm"
              >
                {t('s63.designer.applied')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
