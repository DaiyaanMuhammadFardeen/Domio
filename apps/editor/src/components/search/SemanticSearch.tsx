/**
 * SemanticSearch — /page wrapper + search bar + result list.
 *
 * Per Wave 6 §S6.10 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Debounces input by 300ms before calling POST /v1/ai/search/slides.
 * Results are slides (across the workspace) ranked by semantic match.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Search } from 'lucide-react';
import { useT } from '../../lib/locale';
import {
  searchSlides,
  type SemanticSearchResponse,
  type SemanticSearchResult,
} from '../../lib/search-service';

export interface SemanticSearchProps {
  /** Optional workspace id to scope the search. */
  workspaceId?: string;
  /** Jump to a result (e.g. open the slide in the editor). */
  onJump?: (result: SemanticSearchResult) => void;
  /** Optional base URL for the AI service. */
  apiBaseUrl?: string;
}

const DEBOUNCE_MS = 300;
const RESULT_TESTID_PREFIX = 'p6-search-result';

export function SemanticSearch({
  workspaceId,
  onJump,
  apiBaseUrl,
}: SemanticSearchProps): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SemanticSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestRef = useRef(0);

  // Debounced search effect.
  useEffect(() => {
    const trimmed = query.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!trimmed) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const reqId = latestRequestRef.current + 1;
    latestRequestRef.current = reqId;
    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const out = await searchSlides(
            {
              query: trimmed,
              ...(workspaceId ? { workspaceId } : {}),
              limit: 20,
            },
            apiBaseUrl,
          );
          // Drop stale responses if the user has typed again.
          if (reqId !== latestRequestRef.current) return;
          setResult(out);
          setError(null);
        } catch (err) {
          if (reqId !== latestRequestRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (reqId === latestRequestRef.current) setBusy(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, workspaceId, apiBaseUrl]);

  const handleJump = useCallback(
    (r: SemanticSearchResult) => {
      onJump?.(r);
    },
    [onJump],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="p6-semantic-search">
      <label
        htmlFor="p6-semantic-search-input"
        className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-1.5"
      >
        <Search size={14} className="text-slate-500" />
        <input
          id="p6-semantic-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('p6.copilot.search.placeholder')}
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
          data-testid="p6-semantic-search-input"
        />
        {busy && (
          <span
            className="text-[10px] text-slate-500"
            data-testid="p6-semantic-search-busy"
          >
            {t('p6.copilot.search.searching')}
          </span>
        )}
      </label>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300" data-testid="p6-semantic-search-error">
          {error}
        </div>
      )}

      {result && result.results.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-700/60 bg-slate-800/30 px-3 py-6 text-center text-xs text-slate-500" data-testid="p6-semantic-search-empty">
          {t('p6.copilot.search.empty')}
        </div>
      )}

      {result && result.results.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="p6-semantic-search-results">
          {result.results.map((r, i) => (
            <li
              key={`${r.slideId}-${i}`}
              className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3"
              data-testid={`${RESULT_TESTID_PREFIX}-${i}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-100">
                    {r.slideTitle}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {r.deckTitle}
                  </span>
                </div>
                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300" data-testid={`${RESULT_TESTID_PREFIX}-${i}-score`}>
                  {Math.round(r.score * 100)}%
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                {r.snippet}
              </p>
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => handleJump(r)}
                  className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300 transition-colors hover:border-blue-400 hover:text-blue-200"
                  data-testid={`${RESULT_TESTID_PREFIX}-${i}-jump`}
                >
                  {t('p6.copilot.search.jump')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}