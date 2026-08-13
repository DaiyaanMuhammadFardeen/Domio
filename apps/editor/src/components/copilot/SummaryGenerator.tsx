'use client';

/**
 * SummaryGenerator — TL;DR + executive-summary slide.
 *
 * Per Wave 6 §S6.8 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Calls POST /v1/ai/summary. Renders the TL;DR and the suggested
 * summary slide. An "Insert slide" button is provided so the caller
 * can pick the slide up and add it to the deck (insertion is owned
 * by the parent panel — this component only emits the summary slide
 * via the onInsert callback).
 */

import { useCallback, useState, type ReactElement } from 'react';
import { Sparkles, FileText, Plus } from 'lucide-react';
import {
  generateSummary,
  type DeckContext,
  type SummaryGenerateResponse,
  type SummarySlide,
} from './lib/qa-service';

export interface SummaryGeneratorProps {
  deck: DeckContext;
  /** Fires when the user confirms insertion of the generated slide. */
  onInsert?: (slide: SummarySlide, tldr: string) => void;
  /** Optional override for the testid. */
  dataTestId?: string;
}

export function SummaryGenerator({
  deck,
  onInsert,
  dataTestId = 'summary-generator',
}: SummaryGeneratorProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SummaryGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState(false);

  const onGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInserted(false);
    try {
      const result = await generateSummary({ deck });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }, [deck]);

  const onInsertClick = useCallback(() => {
    if (!response) return;
    onInsert?.(response.summary_slide, response.tldr);
    setInserted(true);
  }, [onInsert, response]);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"
      data-testid={dataTestId}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">Summary</h3>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          data-testid={`${dataTestId}-generate`}
        >
          <Sparkles size={12} className={loading ? 'animate-spin' : ''} />
          {response ? 'Regenerate' : 'Generate'}
        </button>
      </header>

      {error && (
        <p
          className="rounded-md border border-rose-700/60 bg-rose-900/20 p-2 text-xs text-rose-200"
          data-testid={`${dataTestId}-error`}
          role="alert"
        >
          {error}
        </p>
      )}

      {!response && !error && (
        <p className="text-xs text-slate-500" data-testid={`${dataTestId}-empty`}>
          Click <strong className="text-slate-300">Generate</strong> for a 1-pager TL;DR and an
          executive-summary slide.
        </p>
      )}

      {response && (
        <div className="flex flex-col gap-3" data-testid={`${dataTestId}-result`}>
          {response.offline && (
            <p
              className="rounded-md border border-amber-700/60 bg-amber-900/15 p-2 text-[11px] text-amber-200"
              data-testid={`${dataTestId}-offline`}
            >
              Offline mode — using heuristic TL;DR.
            </p>
          )}

          {/* TL;DR */}
          <div
            className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
            data-testid={`${dataTestId}-tldr`}
          >
            <p className="text-[10px] uppercase tracking-wide text-slate-500">TL;DR</p>
            <p className="mt-1 text-sm text-slate-100">{response.tldr}</p>
          </div>

          {/* Summary slide preview */}
          <div
            className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
            data-testid={`${dataTestId}-slide`}
          >
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              Executive summary slide
            </p>
            <p
              className="mt-1 text-base font-semibold text-slate-100"
              data-testid={`${dataTestId}-slide-title`}
            >
              {response.summary_slide.title}
            </p>
            <p className="mt-1 text-xs text-slate-400" data-testid={`${dataTestId}-slide-body`}>
              {response.summary_slide.body}
            </p>
            {response.summary_slide.bullets && response.summary_slide.bullets.length > 0 && (
              <ul
                className="mt-2 list-inside list-disc text-xs text-slate-300"
                data-testid={`${dataTestId}-slide-bullets`}
              >
                {response.summary_slide.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={onInsertClick}
            className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            data-testid={`${dataTestId}-insert`}
            disabled={inserted}
          >
            <Plus size={12} />
            {inserted ? 'Inserted' : 'Insert slide'}
          </button>
        </div>
      )}
    </section>
  );
}
