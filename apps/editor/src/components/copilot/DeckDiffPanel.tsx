'use client';

/**
 * DeckDiffPanel — side-by-side render of two deck versions with
 * per-element diff highlight.
 *
 * Per Wave 6 §S6.13 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Two text inputs accept deck IDs; clicking Compare calls
 * POST /v1/diff/deck. The response is grouped into added / removed /
 * changed buckets and rendered as a unified list (since the editor
 * does not have a real deck renderer yet, the per-element diff is
 * surfaced as labelled cards with the field path + before/after
 * snippet).
 */

import { useCallback, useState, type ReactElement } from 'react';
import { GitCompare, Loader2, AlertTriangle, Plus, Minus, Pencil } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  diffDeck,
  groupByDiff,
  diffBorderClass,
  DIFF_LABEL,
  type DeckDiffEntry,
} from './lib/diff-service';

export interface DeckDiffPanelProps {
  readonly defaultDeckId?: string;
  readonly baseUrl?: string;
  readonly onComplete?: (entries: readonly DeckDiffEntry[]) => void;
}

function diffIcon(diff: DeckDiffEntry['diff']): ReactElement {
  switch (diff) {
    case 'added': return <Plus size={11} />;
    case 'removed': return <Minus size={11} />;
    case 'changed': return <Pencil size={11} />;
  }
}

export function DeckDiffPanel({
  defaultDeckId = '',
  baseUrl,
  onComplete,
}: DeckDiffPanelProps): ReactElement {
  const [deckIdA, setDeckIdA] = useState(defaultDeckId);
  const [deckIdB, setDeckIdB] = useState(defaultDeckId);
  const [entries, setEntries] = useState<readonly DeckDiffEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  const compare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await diffDeck({ deckIdA, deckIdB }, baseUrl);
      setEntries(res.entries);
      setHasCompared(true);
      onComplete?.(res.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'diff failed');
      setEntries([]);
      setHasCompared(true);
    } finally {
      setBusy(false);
    }
  }, [deckIdA, deckIdB, baseUrl, onComplete]);

  const grouped = groupByDiff(entries);
  const total = grouped.added.length + grouped.removed.length + grouped.changed.length;

  return (
    <div className="flex flex-col gap-3" data-testid="deck-diff-root">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCompare size={16} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">
          Deck Diff
        </h2>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2" data-testid="deck-diff-inputs">
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          <span>Deck A</span>
          <input
            type="text"
            value={deckIdA}
            onChange={(e) => setDeckIdA(e.target.value)}
            placeholder="deck-id-a"
            className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500/50"
            data-testid="deck-diff-input-a"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          <span>Deck B</span>
          <input
            type="text"
            value={deckIdB}
            onChange={(e) => setDeckIdB(e.target.value)}
            placeholder="deck-id-b"
            className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500/50"
            data-testid="deck-diff-input-b"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={compare}
        disabled={busy || deckIdA.length === 0 || deckIdB.length === 0}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-indigo-500 disabled:opacity-40"
        data-testid="deck-diff-compare-btn"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <GitCompare size={12} />}
        Compare
      </button>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="deck-diff-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {hasCompared && total === 0 && !busy ? (
        <p
          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300"
          data-testid="deck-diff-empty"
        >
          The two decks are identical.
        </p>
      ) : null}

      {/* Summary pills */}
      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]" data-testid="deck-diff-summary">
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-400">
            +{grouped.added.length} added
          </span>
          <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-400">
            -{grouped.removed.length} removed
          </span>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-400">
            ~{grouped.changed.length} changed
          </span>
        </div>
      ) : null}

      {/* Diff list */}
      {total > 0 ? (
        <ul className="space-y-1" data-testid="deck-diff-list">
          {[...grouped.added, ...grouped.removed, ...grouped.changed].map((entry) => (
            <DiffCard key={`${entry.kind}-${entry.id}-${entry.path ?? ''}`} entry={entry} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffCard
// ---------------------------------------------------------------------------

function DiffCard({ entry }: { entry: DeckDiffEntry }): ReactElement {
  return (
    <li
      className={cn(
        'rounded-md border bg-slate-800/40 px-2.5 py-1.5',
        diffBorderClass(entry.diff),
      )}
      data-testid={`deck-diff-entry-${entry.id}`}
      data-diff={entry.diff}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            entry.diff === 'added' && 'bg-emerald-500/15 text-emerald-400',
            entry.diff === 'removed' && 'bg-red-500/15 text-red-400',
            entry.diff === 'changed' && 'bg-amber-500/15 text-amber-400',
          )}
          data-testid={`deck-diff-entry-classification-${entry.id}`}
        >
          {diffIcon(entry.diff)}
          {DIFF_LABEL[entry.diff]}
        </span>
        <span className="text-[11px] font-medium text-slate-200">
          {entry.kind}
          <span className="ml-1 text-[10px] text-slate-500">{entry.id}</span>
        </span>
        {entry.path ? (
          <span
            className="rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-400"
            data-testid={`deck-diff-entry-path-${entry.id}`}
          >
            {entry.path}
          </span>
        ) : null}
        {entry.slideIndex !== null ? (
          <span className="ml-auto text-[10px] text-slate-500">
            slide {entry.slideIndex + 1}
          </span>
        ) : null}
      </div>

      {(entry.before !== undefined || entry.after !== undefined) ? (
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-[10px] uppercase text-slate-500">Before</p>
            <p
              className="rounded bg-slate-900/60 p-1 text-slate-400"
              data-testid={`deck-diff-entry-before-${entry.id}`}
            >
              {JSON.stringify(entry.before ?? null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500">After</p>
            <p
              className={cn(
                'rounded p-1',
                entry.diff === 'added' && 'bg-emerald-500/10 text-emerald-200',
                entry.diff === 'removed' && 'bg-red-500/10 text-red-200 line-through',
                entry.diff === 'changed' && 'bg-amber-500/10 text-amber-200',
              )}
              data-testid={`deck-diff-entry-after-${entry.id}`}
            >
              {JSON.stringify(entry.after ?? null)}
            </p>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default DeckDiffPanel;