'use client';

/**
 * CopyAssistant — AI copy improvement surface (Wave 6 §S6.4).
 *
 * Hosts a context menu shell that surfaces an "Improve with AI" action
 * on the currently selected text. Clicking it requests 4 variants
 * (shorter, punchier, formal, casual) via POST /v1/ai/copy/improve.
 * Selecting a variant replaces the selection via `onReplace`.
 *
 * The component is deliberately stateless apart from internal UI state
 * so the host (e.g. canvas right-click handler) controls selection
 * scope and replacement semantics.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Sparkles, Wand2, Check } from 'lucide-react';
import {
  improveCopy,
  TONE_LABELS,
  type CopyTone,
  type CopyVariant,
  type ImproveCopyResult,
} from '../../lib/copy-service';
import { useT } from '../../lib/locale';
import { cn } from '../../lib/cn';

export interface CopyAssistantProps {
  /** The currently selected text (empty = context menu disabled). */
  readonly selectedText: string;
  /** Called when the user picks a variant — host replaces the selection. */
  readonly onReplace?: (text: string) => void;
  /** Optional context — passed through to the service. */
  readonly context?: string;
}

const TONE_ORDER: readonly CopyTone[] = ['shorter', 'punchier', 'formal', 'casual'];

export function CopyAssistant({
  selectedText,
  onReplace,
  context,
}: CopyAssistantProps): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImproveCopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setAppliedId(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setAppliedId(null);
  }, []);

  const handleImprove = useCallback(async () => {
    if (!selectedText.trim()) return;
    setLoading(true);
    setError(null);
    setAppliedId(null);
    try {
      const r = await improveCopy({
        text: selectedText,
        tone: 'shorter',
        ...(context ? { context } : {}),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy improvement failed');
    } finally {
      setLoading(false);
    }
  }, [selectedText, context]);

  const handleApply = useCallback(
    (variant: CopyVariant) => {
      setAppliedId(variant.id);
      onReplace?.(variant.text);
    },
    [onReplace],
  );

  const disabled = !selectedText.trim();

  return (
    <div className="relative inline-block" data-testid="copy-assistant">
      {/* Trigger (host wires this to a context menu / right-click). */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed bg-slate-800/40 text-slate-600'
            : 'bg-blue-600 text-white hover:bg-blue-500',
        )}
        data-testid="copy-assistant-trigger"
      >
        <Sparkles size={12} />
        {t('s64.copy.improve')}
      </button>

      {/* Context-menu shell */}
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-2xl"
          data-testid="copy-assistant-menu"
          role="dialog"
          aria-label={t('s64.copy.improve')}
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Wand2 size={12} className="text-blue-400" />
              {t('s64.copy.improve')}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-0.5 text-slate-500 hover:text-slate-300"
              data-testid="copy-assistant-close"
              aria-label={t('s64.copy.close')}
            >
              ×
            </button>
          </div>

          <div className="mt-2 rounded border border-slate-700/60 bg-slate-800/60 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t('s64.copy.selectedLabel')}
            </div>
            <div className="mt-0.5 line-clamp-3 text-xs text-slate-200">
              {selectedText || t('s64.copy.emptySelection')}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleImprove()}
            disabled={disabled || loading}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
            data-testid="copy-assistant-improve-btn"
          >
            <Sparkles size={12} className={loading ? 'animate-pulse' : ''} />
            {loading ? t('s64.copy.generating') : t('s64.copy.generateBtn')}
          </button>

          {error && (
            <div
              className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
              data-testid="copy-assistant-error"
            >
              {error}
            </div>
          )}

          {result && (
            <div className="mt-3 space-y-1.5" data-testid="copy-assistant-variants">
              {TONE_ORDER.map((tone) => {
                const variant = result.variants.find((v) => v.tone === tone);
                if (!variant) return null;
                const isApplied = appliedId === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleApply(variant)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md border p-2 text-left transition-colors',
                      isApplied
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-slate-700/60 bg-slate-800/40 hover:border-blue-500/50 hover:bg-slate-800/70',
                    )}
                    data-testid={`copy-variant-${tone}`}
                    data-variant-id={variant.id}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold uppercase tracking-wide text-slate-400">
                        {TONE_LABELS[tone]}
                      </span>
                      <span className="text-slate-500">{variant.charCount} ch</span>
                    </div>
                    <div className="text-xs text-slate-100">{variant.text}</div>
                    {isApplied && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400">
                        <Check size={10} />
                        {t('s64.copy.applied')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
