'use client';

/**
 * QAGenerator — per-slide anticipated Q&A pairs.
 *
 * Per Wave 6 §S6.8 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * For the active deck, calls POST /v1/ai/qa and renders the returned
 * pairs with the suggested answers. The Generate button is the only
 * entry-point — there is no streaming UX in this wave.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import {
  generateQA,
  type DeckContext,
  type QAGenerateResponse,
  type QAPair,
} from './lib/qa-service';

export interface QAGeneratorProps {
  deck: DeckContext;
  /** Maximum pairs to generate (default 5). */
  maxPairs?: number;
  /** Optional override for the testid. */
  dataTestId?: string;
}

export function QAGenerator({
  deck,
  maxPairs = 5,
  dataTestId = 'qa-generator',
}: QAGeneratorProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QAGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateQA({ deck, max_pairs: maxPairs });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Q&A');
    } finally {
      setLoading(false);
    }
  }, [deck, maxPairs]);

  const pairs: readonly QAPair[] = response?.pairs ?? [];
  const slideTitleById = new Map(deck.slides.map((s) => [s.slide_id, s.title ?? s.slide_id]));

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"
      data-testid={dataTestId}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">Anticipated Q&amp;A</h3>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          data-testid={`${dataTestId}-generate`}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
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
        <p
          className="text-xs text-slate-500"
          data-testid={`${dataTestId}-empty`}
        >
          Click <strong className="text-slate-300">Generate</strong> to anticipate likely tough questions for each slide.
        </p>
      )}

      {response && (
        <>
          {response.offline && (
            <p
              className="rounded-md border border-amber-700/60 bg-amber-900/15 p-2 text-[11px] text-amber-200"
              data-testid={`${dataTestId}-offline`}
            >
              Offline mode — using heuristic questions. Connect the orchestrator for tailored answers.
            </p>
          )}
          <ul className="flex flex-col gap-2" data-testid={`${dataTestId}-list`}>
            {pairs.map((p, idx) => (
              <li
                key={`${p.slide_id}-${idx}`}
                className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3"
                data-testid={`${dataTestId}-pair-${idx}`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                  <span data-testid={`${dataTestId}-pair-${idx}-slide`}>
                    {slideTitleById.get(p.slide_id) ?? p.slide_id}
                  </span>
                  {p.confidence !== undefined && (
                    <span
                      className="rounded-full bg-slate-700/60 px-2 py-0.5 text-slate-300"
                      data-testid={`${dataTestId}-pair-${idx}-confidence`}
                    >
                      {Math.round(p.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-sm font-medium text-slate-100"
                  data-testid={`${dataTestId}-pair-${idx}-question`}
                >
                  {p.question}
                </p>
                <p
                  className="mt-1 text-xs text-slate-400"
                  data-testid={`${dataTestId}-pair-${idx}-answer`}
                >
                  {p.answer}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}