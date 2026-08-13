'use client';

/**
 * AccessibilityFix — Phase 12 AI Copilot surface.
 *
 * Per Wave 6 §S6.9 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Three categories of fixes:
 *   - Missing alt-text  → AI generates a description.
 *   - Missing captions  → AI drafts a caption from transcript / context.
 *   - Reading-order      → AI proposes a sensible element order.
 *
 * UX mirrors LayoutRepair: scan → list → per-row Fix → patch preview
 * → Accept / Reject. Both panels share the same lifecycle; only the
 * service differs.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { Eye, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { useT } from '../../lib/locale';
import { cn } from '../../lib/cn';
import {
  auditAccessibility,
  fixAccessibilityIssue,
  type AccessibilityIssue,
  type AccessibilityFixResponse,
} from './lib/lint-service';

export interface AccessibilityFixProps {
  readonly deckId?: string;
  readonly baseUrl?: string;
  readonly onAccept?: (issueId: string, patch: AccessibilityFixResponse['patch']) => void;
}

const KIND_LABEL: Record<AccessibilityIssue['kind'], string> = {
  'missing-alt-text': 'Missing alt text',
  'missing-caption': 'Missing caption',
  'reading-order': 'Reading order',
  'low-contrast': 'Low contrast',
  'missing-aria-label': 'Missing ARIA label',
};

function severityClass(sev: AccessibilityIssue['severity']): string {
  switch (sev) {
    case 'high': return 'bg-red-500/15 text-red-400';
    case 'medium': return 'bg-amber-500/15 text-amber-400';
    default: return 'bg-slate-500/15 text-slate-400';
  }
}

export function AccessibilityFix({
  deckId = 'demo',
  baseUrl,
  onAccept,
}: AccessibilityFixProps): ReactElement {
  const t = useT();
  const [issues, setIssues] = useState<readonly AccessibilityIssue[]>([]);
  const [patch, setPatch] = useState<AccessibilityFixResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPatch(null);
    try {
      const res = await auditAccessibility(deckId, baseUrl);
      setIssues(res.issues);
      setHasScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'audit failed');
      setIssues([]);
      setHasScanned(true);
    } finally {
      setBusy(false);
    }
  }, [deckId, baseUrl]);

  const fixOne = useCallback(async (issue: AccessibilityIssue) => {
    setFixingId(issue.id);
    setError(null);
    try {
      const res = await fixAccessibilityIssue(deckId, { issueId: issue.id }, baseUrl);
      setPatch(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fix failed');
    } finally {
      setFixingId(null);
    }
  }, [deckId, baseUrl]);

  const accept = useCallback(() => {
    if (!patch) return;
    onAccept?.(patch.issueId, patch.patch);
    setIssues((prev) => prev.filter((i) => i.id !== patch.issueId));
    setPatch(null);
  }, [patch, onAccept]);

  const reject = useCallback(() => setPatch(null), []);

  return (
    <div className="flex flex-col gap-3" data-testid="a11y-fix-root">
      {/* Header + scan button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Accessibility Fix
          </h2>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-emerald-500 disabled:opacity-40"
          data-testid="a11y-fix-scan-btn"
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
          data-testid="a11y-fix-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {/* Empty state */}
      {hasScanned && issues.length === 0 && !busy ? (
        <p
          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300"
          data-testid="a11y-fix-empty"
        >
          No accessibility issues found.
        </p>
      ) : null}

      {/* Issue list */}
      <ul className="space-y-1.5" data-testid="a11y-fix-list">
        {issues.map((issue) => {
          const isFixing = fixingId === issue.id;
          return (
            <li
              key={issue.id}
              className="flex items-start gap-2 rounded-md border border-slate-700/60 bg-slate-800/40 px-2.5 py-1.5"
              data-testid={`a11y-fix-issue-${issue.id}`}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                  severityClass(issue.severity),
                )}
                data-testid={`a11y-fix-severity-${issue.id}`}
              >
                {issue.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">
                  {KIND_LABEL[issue.kind]}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {issue.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fixOne(issue)}
                disabled={isFixing}
                className="shrink-0 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 disabled:opacity-40"
                data-testid={`a11y-fix-fix-${issue.id}`}
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
          data-testid="a11y-fix-patch"
        >
          <p className="text-[11px] font-semibold text-slate-300">
            Patch preview ({patch.patch.length} op{patch.patch.length === 1 ? '' : 's'})
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Before</p>
              <p className="rounded bg-slate-800/60 p-1.5 text-slate-400" data-testid="a11y-fix-patch-before">
                {patch.before}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">After</p>
              <p className="rounded bg-slate-800/60 p-1.5 text-slate-200" data-testid="a11y-fix-patch-after">
                {patch.after}
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={reject}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:bg-slate-700/70"
              data-testid="a11y-fix-reject-btn"
            >
              <X size={11} /> Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-emerald-500"
              data-testid="a11y-fix-accept-btn"
            >
              <Check size={11} /> Accept
            </button>
          </div>
          <span className="sr-only">{t('a11yFix.title')}</span>
        </div>
      ) : null}
    </div>
  );
}

export default AccessibilityFix;