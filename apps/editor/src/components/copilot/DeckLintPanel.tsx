'use client';

/**
 * DeckLintPanel — agent-facing lint violations list with one-click fix.
 *
 * Per Wave 6 §S6.13 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Workflow:
 *   1. "Lint" button → POST /v1/lint/deck.
 *   2. Each violation gets a "Fix" button → POST /v1/lint/deck/fix.
 *   3. Patch preview with Accept / Reject; Accept invokes `onAccept`.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { ListChecks, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  lintDeck,
  fixLintViolation,
  VIOLATION_LABEL,
  type LintViolation,
  type LintFixResponse,
} from './lib/diff-service';

export interface DeckLintPanelProps {
  readonly deckId?: string;
  readonly baseUrl?: string;
  readonly onAccept?: (violationId: string, patch: LintFixResponse['patch']) => void;
}

function severityClass(sev: LintViolation['severity']): string {
  switch (sev) {
    case 'high':
      return 'bg-red-500/15 text-red-400';
    case 'medium':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-slate-500/15 text-slate-400';
  }
}

export function DeckLintPanel({
  deckId = 'demo',
  baseUrl,
  onAccept,
}: DeckLintPanelProps): ReactElement {
  const [violations, setViolations] = useState<readonly LintViolation[]>([]);
  const [patch, setPatch] = useState<LintFixResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPatch(null);
    try {
      const res = await lintDeck(deckId, baseUrl);
      setViolations(res.violations);
      setHasScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'lint failed');
      setViolations([]);
      setHasScanned(true);
    } finally {
      setBusy(false);
    }
  }, [deckId, baseUrl]);

  const fixOne = useCallback(
    async (violation: LintViolation) => {
      setFixingId(violation.id);
      setError(null);
      try {
        const res = await fixLintViolation(deckId, violation.id, baseUrl);
        setPatch(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'fix failed');
      } finally {
        setFixingId(null);
      }
    },
    [deckId, baseUrl],
  );

  const accept = useCallback(() => {
    if (!patch) return;
    onAccept?.(patch.violationId, patch.patch);
    setViolations((prev) => prev.filter((v) => v.id !== patch.violationId));
    setPatch(null);
  }, [patch, onAccept]);

  const reject = useCallback(() => setPatch(null), []);

  return (
    <div className="flex flex-col gap-3" data-testid="deck-lint-root">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">Deck Lint</h2>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-cyan-500 disabled:opacity-40"
          data-testid="deck-lint-scan-btn"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          {hasScanned ? 'Re-lint' : 'Lint'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="deck-lint-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {hasScanned && violations.length === 0 && !busy ? (
        <p
          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300"
          data-testid="deck-lint-empty"
        >
          No violations found.
        </p>
      ) : null}

      <ul className="space-y-1.5" data-testid="deck-lint-list">
        {violations.map((v) => {
          const isFixing = fixingId === v.id;
          return (
            <li
              key={v.id}
              className="flex items-start gap-2 rounded-md border border-slate-700/60 bg-slate-800/40 px-2.5 py-1.5"
              data-testid={`deck-lint-violation-${v.id}`}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                  severityClass(v.severity),
                )}
                data-testid={`deck-lint-severity-${v.id}`}
              >
                {v.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">
                  {VIOLATION_LABEL[v.kind]}
                </p>
                <p className="truncate text-[11px] text-slate-500">{v.message}</p>
              </div>
              <button
                type="button"
                onClick={() => fixOne(v)}
                disabled={isFixing}
                className="shrink-0 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-all hover:border-cyan-500/50 hover:bg-cyan-500/10 disabled:opacity-40"
                data-testid={`deck-lint-fix-${v.id}`}
              >
                {isFixing ? <Loader2 size={11} className="animate-spin" /> : 'Fix'}
              </button>
            </li>
          );
        })}
      </ul>

      {patch ? (
        <div
          className="rounded-md border border-cyan-500/40 bg-cyan-500/5 p-2.5"
          data-testid="deck-lint-patch"
        >
          <p className="text-[11px] font-semibold text-cyan-300">
            Patch preview ({patch.patch.length} op{patch.patch.length === 1 ? '' : 's'})
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Before</p>
              <p
                className="rounded bg-slate-800/60 p-1.5 text-slate-400"
                data-testid="deck-lint-patch-before"
              >
                {patch.before}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">After</p>
              <p
                className="rounded bg-slate-800/60 p-1.5 text-slate-200"
                data-testid="deck-lint-patch-after"
              >
                {patch.after}
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={reject}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:bg-slate-700/70"
              data-testid="deck-lint-reject-btn"
            >
              <X size={11} /> Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-emerald-500"
              data-testid="deck-lint-accept-btn"
            >
              <Check size={11} /> Accept
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DeckLintPanel;
