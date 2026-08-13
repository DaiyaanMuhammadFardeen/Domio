'use client';

/**
 * ProvenanceDrawer — slide-over panel that exposes the full
 * provenance record for a data-bound element.
 *
 * Per Wave 11 §S11.11 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Contents:
 *  - Source system (e.g. "Stripe", "Salesforce", "Internal DB")
 *  - Query (the SQL / API path used to fetch)
 *  - Owner (team or person)
 *  - Last-verified date (with relative time)
 *  - Freshness badge (Fresh / Stale / Outdated)
 *  - Agent-readable endpoint text input:
 *      services/ai-orchestrator/get_provenance?id={id}
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { X, RefreshCw, Copy, Check, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/locale';
import {
  FRESHNESS_COLOR,
  FRESHNESS_KEY,
  formatRelative,
  getProvenance,
  refreshProvenance,
  type Provenance,
} from '../../lib/provenance-service';

export interface ProvenanceDrawerProps {
  /** Whether the drawer is open. */
  readonly open: boolean;
  /** Element to load provenance for. */
  readonly elementId: string;
  /** Fired when the user requests close (X button, backdrop, Escape). */
  readonly onClose: () => void;
  /** Optional override for testing — bypasses the seed lookup. */
  readonly fetchProvenance?: (elementId: string) => Promise<Provenance | null>;
  /** Optional override for the refresh action. */
  readonly doRefresh?: (elementId: string) => Promise<Provenance>;
  /** Optional override for the copy action. */
  readonly copyText?: (text: string) => Promise<boolean> | boolean;
}

type Status = 'idle' | 'loading' | 'ready' | 'refreshing' | 'copied' | 'refreshed' | 'error';

export function ProvenanceDrawer({
  open,
  elementId,
  onClose,
  fetchProvenance,
  doRefresh,
  copyText,
}: ProvenanceDrawerProps): ReactElement | null {
  const t = useT();
  const [record, setRecord] = useState<Provenance | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const loader = useMemo(
    () => fetchProvenance ?? ((id: string) => getProvenance(id)),
    [fetchProvenance],
  );
  const refresher = useMemo(
    () => doRefresh ?? ((id: string) => refreshProvenance(id)),
    [doRefresh],
  );

  // Load (or reload) when the drawer opens / elementId changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    loader(elementId)
      .then((out) => {
        if (cancelled) return;
        setRecord(out);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load provenance');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, elementId, loader]);

  const handleRefresh = useCallback(async () => {
    setStatus('refreshing');
    setError(null);
    try {
      const next = await refresher(elementId);
      setRecord(next);
      setStatus('refreshed');
      // Settle the toast after a short delay.
      window.setTimeout(() => {
        setStatus((prev) => (prev === 'refreshed' ? 'ready' : prev));
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh provenance');
      setStatus('error');
    }
  }, [elementId, refresher]);

  const handleCopy = useCallback(async () => {
    if (!record) return;
    const endpoint = record.agent_endpoint;
    let ok = false;
    try {
      if (copyText) {
        ok = await copyText(endpoint);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(endpoint);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setStatus('copied');
      window.setTimeout(() => {
        setStatus((prev) => (prev === 'copied' ? 'ready' : prev));
      }, 1500);
    } else {
      setError('Failed to copy to clipboard.');
      setStatus('error');
    }
  }, [record, copyText]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('editor.provenance.drawer.heading')}
      data-testid="provenance-drawer"
      data-element-id={elementId}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close provenance drawer"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        data-testid="provenance-drawer-backdrop"
        tabIndex={-1}
      />

      {/* Panel */}
      <aside
        className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-slate-800 bg-slate-900 text-slate-100 shadow-2xl"
        data-testid="provenance-drawer-panel"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2
            className="text-sm font-semibold tracking-wide"
            data-testid="provenance-drawer-heading"
          >
            {t('editor.provenance.drawer.heading')}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            data-testid="provenance-drawer-close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
          {status === 'loading' ? (
            <div
              className="flex items-center gap-2 text-slate-400"
              data-testid="provenance-drawer-loading"
            >
              <RefreshCw size={14} className="animate-spin" aria-hidden />
              Loading…
            </div>
          ) : null}

          {status === 'error' && error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200"
              data-testid="provenance-drawer-error"
            >
              <AlertCircle size={14} aria-hidden className="mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {status === 'refreshed' ? (
            <p
              className="mb-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200"
              data-testid="provenance-drawer-refreshed"
            >
              {t('editor.provenance.drawer.refreshed')}
            </p>
          ) : null}

          {record ? (
            <dl className="space-y-4">
              <Row label={t('editor.provenance.drawer.source')} testId="provenance-drawer-source">
                <span data-testid="provenance-drawer-source-value">
                  {record.source_system}
                </span>
              </Row>

              <Row label={t('editor.provenance.drawer.query')} testId="provenance-drawer-query">
                <code
                  className="block max-w-full whitespace-pre-wrap break-words rounded bg-slate-950/60 px-2 py-1 text-[11px] font-mono text-slate-200 ring-1 ring-slate-800"
                  data-testid="provenance-drawer-query-value"
                >
                  {record.query}
                </code>
              </Row>

              <Row label={t('editor.provenance.drawer.owner')} testId="provenance-drawer-owner">
                <span data-testid="provenance-drawer-owner-value">{record.owner}</span>
              </Row>

              <Row label={t('editor.provenance.drawer.lastVerified')} testId="provenance-drawer-last-verified">
                <span className="flex flex-col gap-0.5">
                  <time
                    dateTime={new Date(record.last_verified_at_ms).toISOString()}
                    data-testid="provenance-drawer-last-verified-value"
                  >
                    {new Date(record.last_verified_at_ms).toLocaleString()}
                  </time>
                  <span
                    className="text-xs text-slate-400"
                    data-testid="provenance-drawer-last-verified-relative"
                  >
                    {formatRelative(record.last_verified_at_ms)}
                  </span>
                </span>
              </Row>

              <Row label={t('editor.provenance.drawer.freshness')} testId="provenance-drawer-freshness">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
                    FRESHNESS_COLOR[record.freshness],
                  )}
                  data-testid="provenance-drawer-freshness-badge"
                  data-freshness={record.freshness}
                >
                  {t(FRESHNESS_KEY[record.freshness])}
                </span>
              </Row>

              <Row label={t('editor.provenance.drawer.agentEndpoint')} testId="provenance-drawer-agent-endpoint">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={record.agent_endpoint}
                    aria-label={t('editor.provenance.drawer.agentEndpoint')}
                    onFocus={(event) => event.currentTarget.select()}
                    className="flex-1 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    data-testid="provenance-drawer-agent-endpoint-input"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-100 transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    data-testid="provenance-drawer-copy"
                  >
                    {status === 'copied' ? (
                      <>
                        <Check size={11} aria-hidden /> {t('editor.provenance.drawer.copied')}
                      </>
                    ) : (
                      <>
                        <Copy size={11} aria-hidden /> {t('editor.provenance.drawer.copy')}
                      </>
                    )}
                  </button>
                </div>
              </Row>
            </dl>
          ) : null}

          {status !== 'loading' && !record && !error ? (
            <p
              className="text-sm text-slate-400"
              data-testid="provenance-drawer-empty"
            >
              {t('editor.provenance.drawer.empty')}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={status === 'refreshing'}
            className={cn(
              'inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors',
              'hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
              status === 'refreshing' && 'cursor-wait opacity-60',
            )}
            data-testid="provenance-drawer-refresh"
          >
            <RefreshCw
              size={12}
              aria-hidden
              className={cn(status === 'refreshing' && 'animate-spin')}
            />
            {t('editor.provenance.drawer.refresh')}
          </button>
        </footer>
      </aside>
    </div>
  );
}

interface RowProps {
  label: string;
  testId?: string;
  children: ReactElement;
}

function Row({ label, testId, children }: RowProps): ReactElement {
  return (
    <div className="grid grid-cols-3 gap-3" data-testid={testId}>
      <dt className="col-span-1 text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="col-span-2 text-sm text-slate-100">{children}</dd>
    </div>
  );
}

export default ProvenanceDrawer;