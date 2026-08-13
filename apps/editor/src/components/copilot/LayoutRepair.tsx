'use client';

/**
 * LayoutRepair — Phase 12 AI Copilot surface.
 *
 * Per Wave 6 §S6.9 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Two-phase UI:
 *   1. "Scan" button calls `POST /v1/ai/lint-layout` and lists every
 *      issue found (overflow / misalignment / orphaned elements, …).
 *   2. Per-row "Fix" button calls `POST /v1/ai/lint-layout/fix` and
 *      renders a patch preview with Accept / Reject actions.
 *
 * The component owns no global state — everything lives in the call
 * to `fixLayoutIssue` and the local Accept/Reject reducer.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { Wrench, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { useT } from '../../lib/locale';
import { cn } from '../../lib/cn';
import {
  lintLayout,
  fixLayoutIssue,
  type LayoutIssue,
  type LayoutFixResponse,
} from './lib/lint-service';

export interface LayoutRepairProps {
  /** Deck to inspect; defaults to the demo deck. */
  readonly deckId?: string;
  /** Override the API base URL (used in tests). */
  readonly baseUrl?: string;
  /** Called when the user accepts a fix patch. */
  readonly onAccept?: (issueId: string, patch: LayoutFixResponse['patch']) => void;
}

const KIND_LABEL: Record<LayoutIssue['kind'], string> = {
  'overflow-text': 'Overflow text',
  misalignment: 'Misaligned',
  'orphaned-element': 'Orphaned element',
  'off-canvas': 'Off canvas',
  overlap: 'Overlapping',
};

function severityClass(sev: LayoutIssue['severity']): string {
  switch (sev) {
    case 'high':
      return 'bg-red-500/15 text-red-400';
    case 'medium':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-slate-500/15 text-slate-400';
  }
}

export function LayoutRepair({
  deckId = 'demo',
  baseUrl,
  onAccept,
}: LayoutRepairProps): ReactElement {
  const t = useT();
  const [issues, setIssues] = useState<readonly LayoutIssue[]>([]);
  const [patch, setPatch] = useState<LayoutFixResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPatch(null);
    try {
      const res = await lintLayout(deckId, baseUrl);
      setIssues(res.issues);
      setHasScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'lint failed');
      setIssues([]);
      setHasScanned(true);
    } finally {
      setBusy(false);
    }
  }, [deckId, baseUrl]);

  const fixOne = useCallback(
    async (issue: LayoutIssue) => {
      setFixingId(issue.id);
      setError(null);
      try {
        const res = await fixLayoutIssue(deckId, { issueId: issue.id }, baseUrl);
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
    onAccept?.(patch.issueId, patch.patch);
    setIssues((prev) => prev.filter((i) => i.id !== patch.issueId));
    setPatch(null);
  }, [patch, onAccept]);

  const reject = useCallback(() => setPatch(null), []);

  return (
    <div className="flex flex-col gap-3" data-testid="layout-repair-root">
      {/* Header + scan button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-100">Layout Repair</h2>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40"
          data-testid="layout-repair-scan-btn"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          {hasScanned ? 'Re-scan' : 'Scan'}
        </button>
      </div>

      {/* Error */}
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="layout-repair-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {/* Issue list */}
      {hasScanned && issues.length === 0 && !busy ? (
        <p
          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300"
          data-testid="layout-repair-empty"
        >
          No layout issues found.
        </p>
      ) : null}

      <ul className="space-y-1.5" data-testid="layout-repair-list">
        {issues.map((issue) => {
          const isFixing = fixingId === issue.id;
          return (
            <li
              key={issue.id}
              className="flex items-start gap-2 rounded-md border border-slate-700/60 bg-slate-800/40 px-2.5 py-1.5"
              data-testid={`layout-repair-issue-${issue.id}`}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                  severityClass(issue.severity),
                )}
                data-testid={`layout-repair-severity-${issue.id}`}
              >
                {issue.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">
                  {KIND_LABEL[issue.kind]}
                </p>
                <p className="truncate text-[11px] text-slate-500">{issue.message}</p>
              </div>
              <button
                type="button"
                onClick={() => fixOne(issue)}
                disabled={isFixing}
                className="shrink-0 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-all hover:border-blue-500/50 hover:bg-blue-500/10 disabled:opacity-40"
                data-testid={`layout-repair-fix-${issue.id}`}
              >
                {isFixing ? <Loader2 size={11} className="animate-spin" /> : 'Fix'}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Patch preview */}
      {patch ? (
        <div
          className="rounded-md border border-slate-700/60 bg-slate-900/60 p-2.5"
          data-testid="layout-repair-patch"
        >
          <p className="text-[11px] font-semibold text-slate-300">
            Patch preview ({patch.patch.length} op{patch.patch.length === 1 ? '' : 's'})
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Before</p>
              <p
                className="rounded bg-slate-800/60 p-1.5 text-slate-400"
                data-testid="layout-repair-patch-before"
              >
                {patch.before}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">After</p>
              <p
                className="rounded bg-slate-800/60 p-1.5 text-slate-200"
                data-testid="layout-repair-patch-after"
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
              data-testid="layout-repair-reject-btn"
            >
              <X size={11} /> Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-emerald-500"
              data-testid="layout-repair-accept-btn"
            >
              <Check size={11} /> Accept
            </button>
          </div>
          <span className="sr-only">{t('layoutRepair.title')}</span>
        </div>
      ) : null}
    </div>
  );
}

export default LayoutRepair;
