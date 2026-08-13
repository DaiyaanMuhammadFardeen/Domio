'use client';

/**
 * TranslationDialog — AI translation surface (Wave 6 §S6.4).
 *
 * Flow:
 *   1. Pick a target language (8 options: en, es, fr, de, ja, zh-CN, ar, ur).
 *   2. (Optional) Provide glossary terms that must be preserved verbatim.
 *   3. Click "Translate" → POST /v1/ai/copy/translate.
 *   4. RTL flip applied automatically for ar/ur.
 *   5. Click "Apply" → host replaces the selection.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Languages, ArrowRight, BookText } from 'lucide-react';
import {
  TARGET_LANGUAGES,
  TARGET_LANGUAGE_LABELS,
  RTL_LANGUAGES,
  translateText,
  type TargetLanguage,
  type TranslateResult,
} from '../../lib/copy-service';
import { useT } from '../../lib/locale';
import { cn } from '../../lib/cn';

export interface GlossaryEntry {
  readonly source: string;
  readonly target: string;
}

export interface TranslationDialogProps {
  readonly open: boolean;
  readonly selectedText: string;
  /** Optional existing glossary entries to honor during translation. */
  readonly glossary?: readonly GlossaryEntry[];
  /** Called when the user confirms applying the translation. */
  readonly onApply?: (text: string, target: TargetLanguage) => void;
  /** Called when the user closes the dialog. */
  readonly onClose?: () => void;
}

export function TranslationDialog({
  open,
  selectedText,
  glossary = [],
  onApply,
  onClose,
}: TranslationDialogProps): ReactElement {
  const t = useT();
  const [target, setTarget] = useState<TargetLanguage>('es');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the dialog re-opens or the source text changes.
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
    }
  }, [open, selectedText]);

  const isRtl = RTL_LANGUAGES.has(target);

  const handleTranslate = useCallback(async () => {
    if (!selectedText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await translateText({
        text: selectedText,
        target,
        glossary: glossary.map((g) => ({ source: g.source, target: g.target })),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, [selectedText, target, glossary]);

  const handleApply = useCallback(() => {
    if (!result) return;
    onApply?.(result.translatedText, result.target);
  }, [result, onApply]);

  if (!open) return <span data-testid="translation-dialog-closed" aria-hidden />;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4"
      data-testid="translation-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('s64.translation.title')}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        dir="ltr"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Languages size={16} className="text-blue-400" />
            {t('s64.translation.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:text-slate-300"
            data-testid="translation-close"
            aria-label={t('s64.translation.close')}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          {/* Language picker */}
          <div>
            <label htmlFor="translation-target" className="text-xs font-medium text-slate-400">
              {t('s64.translation.targetLabel')}
            </label>
            <select
              id="translation-target"
              value={target}
              onChange={(e) => setTarget(e.target.value as TargetLanguage)}
              className="mt-1 block w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
              data-testid="translation-target-select"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {TARGET_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {TARGET_LANGUAGE_LABELS[code]} ({code})
                </option>
              ))}
            </select>
            {isRtl && (
              <div className="mt-1 text-[11px] text-amber-400" data-testid="translation-rtl-hint">
                {t('s64.translation.rtlHint')}
              </div>
            )}
          </div>

          {/* Glossary summary */}
          {glossary.length > 0 && (
            <div
              className="rounded border border-slate-700/60 bg-slate-800/40 p-2"
              data-testid="translation-glossary"
            >
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                <BookText size={10} />
                {t('s64.translation.glossaryLabel', { count: glossary.length })}
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-300">
                {glossary.slice(0, 4).map((g, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-400">
                      {g.source}
                    </span>
                    <ArrowRight size={10} className="text-slate-500" />
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
                      {g.target}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source + preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {t('s64.translation.sourceLabel')}
              </div>
              <div className="mt-1 max-h-32 overflow-y-auto rounded border border-slate-700/60 bg-slate-800/40 p-2 text-xs text-slate-200">
                {selectedText || (
                  <span className="text-slate-500">{t('s64.translation.emptySource')}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {t('s64.translation.previewLabel')}
              </div>
              <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className={cn(
                  'mt-1 max-h-32 overflow-y-auto rounded border p-2 text-xs',
                  isRtl
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                    : 'border-slate-700/60 bg-slate-800/40 text-slate-200',
                )}
                data-testid="translation-preview"
                data-rtl={isRtl ? 'true' : 'false'}
              >
                {result?.translatedText ?? (
                  <span className="text-slate-500">{t('s64.translation.previewEmpty')}</span>
                )}
              </div>
              {result && result.glossaryApplied.length > 0 && (
                <div className="mt-1 text-[10px] text-emerald-400">
                  {t('s64.translation.glossaryApplied', {
                    terms: result.glossaryApplied.join(', '),
                  })}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
              data-testid="translation-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-700/60 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            data-testid="translation-cancel"
          >
            {t('s64.translation.cancel')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleTranslate()}
              disabled={!selectedText.trim() || loading}
              className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-40"
              data-testid="translation-translate-btn"
            >
              <Languages size={12} />
              {loading ? t('s64.translation.translating') : t('s64.translation.translateBtn')}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!result}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
              data-testid="translation-apply-btn"
            >
              <ArrowRight size={12} />
              {t('s64.translation.applyBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
