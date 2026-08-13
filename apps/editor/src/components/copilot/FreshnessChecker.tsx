'use client';

/**
 * FreshnessChecker — Phase 12 AI Copilot surface.
 *
 * Per Wave 6 §S6.11 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Workflow:
 *   1. "Scan" → POST /v1/ai/check-freshness
 *   2. Per-claim chip shows freshness score + kind label.
 *   3. Click a chip → POST /v1/ai/check-freshness/update for a
 *      suggested replacement; the panel renders a small Accept/Reject
 *      preview so the user can review before applying.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { CalendarClock, Check, X, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  checkFreshness,
  suggestFreshnessUpdate,
  freshnessScoreColor,
  KIND_LABEL,
  type FreshnessClaim,
  type FreshnessUpdateResponse,
} from './lib/freshness-service';

export interface FreshnessCheckerProps {
  readonly deckId?: string;
  readonly baseUrl?: string;
  readonly onAccept?: (claimId: string, replacement: string) => void;
}

export function FreshnessChecker({
  deckId = 'demo',
  baseUrl,
  onAccept,
}: FreshnessCheckerProps): ReactElement {
  const [claims, setClaims] = useState<readonly FreshnessClaim[]>([]);
  const [update, setUpdate] = useState<FreshnessUpdateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setUpdate(null);
    try {
      const res = await checkFreshness(deckId, baseUrl);
      setClaims(res.claims);
      setScannedAt(res.scannedAt);
      setHasScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'freshness scan failed');
      setClaims([]);
      setHasScanned(true);
    } finally {
      setBusy(false);
    }
  }, [deckId, baseUrl]);

  const openUpdate = useCallback(async (claim: FreshnessClaim) => {
    setLoadingId(claim.id);
    setError(null);
    try {
      const res = await suggestFreshnessUpdate(deckId, { claimId: claim.id }, baseUrl);
      setUpdate(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed');
    } finally {
      setLoadingId(null);
    }
  }, [deckId, baseUrl]);

  const accept = useCallback(() => {
    if (!update) return;
    onAccept?.(update.claimId, update.replacement);
    setClaims((prev) => prev.filter((c) => c.id !== update.claimId));
    setUpdate(null);
  }, [update, onAccept]);

  const reject = useCallback(() => setUpdate(null), []);

  return (
    <div className="flex flex-col gap-3" data-testid="freshness-root">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Freshness
          </h2>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-amber-500 disabled:opacity-40"
          data-testid="freshness-scan-btn"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {hasScanned ? 'Re-scan' : 'Scan'}
        </button>
      </div>

      {scannedAt ? (
        <p className="text-[10px] text-slate-500" data-testid="freshness-scanned-at">
          Scanned {new Date(scannedAt).toLocaleString()}
        </p>
      ) : null}

      {/* Error */}
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="freshness-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {/* Empty state */}
      {hasScanned && claims.length === 0 && !busy ? (
        <p
          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300"
          data-testid="freshness-empty"
        >
          All claims look fresh.
        </p>
      ) : null}

      {/* Claim chips */}
      <ul className="flex flex-wrap gap-1.5" data-testid="freshness-chip-list">
        {claims.map((claim) => {
          const isLoading = loadingId === claim.id;
          return (
            <li key={claim.id}>
              <button
                type="button"
                onClick={() => openUpdate(claim)}
                disabled={isLoading}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/40 px-2.5 py-1 text-[11px] text-slate-200 transition-all hover:border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-40',
                )}
                data-testid={`freshness-chip-${claim.id}`}
                aria-label={`${KIND_LABEL[claim.kind]} freshness ${claim.freshnessScore}`}
              >
                {isLoading ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      freshnessScoreColor(claim.freshnessScore),
                    )}
                    data-testid={`freshness-score-${claim.id}`}
                  >
                    {claim.freshnessScore}
                  </span>
                )}
                <span className="max-w-[140px] truncate" title={claim.text}>
                  {claim.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Suggested update */}
      {update ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5"
          data-testid="freshness-update"
        >
          <p className="text-[11px] font-semibold text-amber-300">
            Suggested update
          </p>
          <p className="mt-1 rounded bg-slate-800/60 p-1.5 text-[11px] text-slate-200" data-testid="freshness-update-replacement">
            {update.replacement}
          </p>
          {update.rationale ? (
            <p className="mt-1 text-[10px] text-slate-500" data-testid="freshness-update-rationale">
              {update.rationale}
            </p>
          ) : null}
          {update.replacementSource ? (
            <p className="mt-0.5 text-[10px] text-slate-500" data-testid="freshness-update-source">
              Source: {update.replacementSource}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={reject}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:bg-slate-700/70"
              data-testid="freshness-reject-btn"
            >
              <X size={11} /> Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-emerald-500"
              data-testid="freshness-accept-btn"
            >
              <Check size={11} /> Accept
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FreshnessChecker;