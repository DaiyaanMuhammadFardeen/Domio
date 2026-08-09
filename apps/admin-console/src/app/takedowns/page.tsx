'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { Badge, toneForTakedownStatus, toneForTakedownKind } from '../../components/Badge';
import { fetcher } from '../../lib/fetcher';
import type { TakedownRequest, TakedownStatus } from '../../lib/types';

type Row = Record<string, unknown> & TakedownRequest;

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TakedownsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TakedownStatus | ''>('');
  const [kindFilter, setKindFilter] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (kindFilter) params.set('kind', kindFilter);
      const qs = params.toString();
      const res = await fetcher<{ items: TakedownRequest[]; total: number }>(
        `/v1/takedowns${qs ? `?${qs}` : ''}`,
      );
      setRows(res.items as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load takedowns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, kindFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleResolve(decision: 'confirmed' | 'dismissed') {
    if (!selected) return;
    setResolveBusy(true);
    try {
      await fetcher(`/v1/takedowns/${selected.request_id}/resolve`, {
        method: 'POST',
        body: { decision, resolution_notes: resolveNotes || undefined },
      });
      setSelected(null);
      setResolveNotes('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setResolveBusy(false);
    }
  }

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    { key: 'request_id', header: 'ID', type: 'string' },
    { key: 'listing_id', header: 'Listing', type: 'string' },
    { key: 'claimant_id', header: 'Claimant', type: 'string' },
    {
      key: 'kind',
      header: 'Kind',
      type: 'string',
      format: (val) => <Badge tone={toneForTakedownKind(String(val))}>{String(val)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      type: 'string',
      format: (val) => <Badge tone={toneForTakedownStatus(String(val))}>{String(val)}</Badge>,
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      type: 'number',
      format: (val) => formatDate(val as number),
    },
    {
      key: 'request_id',
      header: '',
      type: 'string',
      format: (_val, row) => (
        <button
          type="button"
          onClick={() => setSelected(row)}
          className="text-xs font-medium text-brand-600 hover:text-brand-800"
        >
          View details
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Takedown Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review DMCA, trademark, and policy takedown requests. Resolve or dismiss each claim.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600" htmlFor="status-filter">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TakedownStatus | '')}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All</option>
            <option value="received">Received</option>
            <option value="in_review">In Review</option>
            <option value="confirmed">Confirmed</option>
            <option value="dismissed">Dismissed</option>
            <option value="counter_notice">Counter Notice</option>
            <option value="resolved">Resolved</option>
          </select>
          <label className="text-xs font-medium text-slate-600" htmlFor="kind-filter">
            Kind
          </label>
          <select
            id="kind-filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All</option>
            <option value="dmca">DMCA</option>
            <option value="trademark">Trademark</option>
            <option value="policy">Policy</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {!loading && !error && (
        <SortableTable<Row>
          rows={rows}
          columns={columns}
          emptyMessage="No takedown requests match the current filters."
        />
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Takedown details">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Takedown Details</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close detail panel"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 px-6 py-4 space-y-5">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Request ID</div>
                <div className="mt-0.5 font-mono text-sm text-slate-900">{selected.request_id}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Listing</div>
                <div className="mt-0.5 font-mono text-sm text-slate-900">{selected.listing_id}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Kind</div>
                  <div className="mt-1"><Badge tone={toneForTakedownKind(selected.kind)}>{selected.kind}</Badge></div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</div>
                  <div className="mt-1"><Badge tone={toneForTakedownStatus(selected.status)}>{selected.status}</Badge></div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Claimant</div>
                <div className="mt-0.5 text-sm text-slate-900">{selected.claimant_id}</div>
              </div>
              {selected.evidence_url && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence</div>
                  <a
                    href={selected.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
                  >
                    View evidence <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </div>
              )}
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Statement</div>
                <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{selected.statement}</p>
              </div>
              {selected.resolution_notes && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolution Notes</div>
                  <p className="mt-0.5 text-sm text-slate-700">{selected.resolution_notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                <div>
                  <span className="font-medium">Submitted:</span> {formatDate(selected.submitted_at)}
                </div>
                <div>
                  <span className="font-medium">Resolved:</span> {formatDate(selected.resolved_at)}
                </div>
              </div>
            </div>

            {(selected.status === 'received' || selected.status === 'in_review') && (
              <div className="border-t border-slate-200 px-6 py-4 space-y-3">
                <label htmlFor="resolve-notes" className="text-xs font-medium text-slate-600">
                  Resolution Notes (optional)
                </label>
                <textarea
                  id="resolve-notes"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes about this resolution..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={resolveBusy}
                    onClick={() => handleResolve('confirmed')}
                    className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    Confirm Takedown
                  </button>
                  <button
                    type="button"
                    disabled={resolveBusy}
                    onClick={() => handleResolve('dismissed')}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {selected.status === 'counter_notice' && (
              <div className="border-t border-slate-200 px-6 py-4">
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                  A counter-notice has been submitted for this request. The original claimant has 10 business days to respond with legal action before the listing is restored.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
