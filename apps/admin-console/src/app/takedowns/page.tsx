'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { adminConsole } from '@domio/ui';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { TakedownDetailPanel } from '../../components/takedowns/TakedownDetailPanel';
import { fetcher } from '../../lib/fetcher';
import type { TakedownRequest, TakedownStatus } from '../../lib/types';
import type { TakedownEvent } from '../../lib/takedown-service';
import type { ResolveDecision } from '../../components/takedowns/ResolveForm';

type Row = Record<string, unknown> & TakedownRequest;

const DRAWER_LABELS = {
  claimant: 'Claimant',
  respondent: 'Respondent',
  evidence: 'Evidence',
  statement: 'Statement',
  notes: 'Resolution notes',
  events: 'Timeline',
  confirm: 'Confirm takedown',
  dismiss: 'Dismiss',
  counterNotice:
    'A counter-notice has been submitted for this request. The original claimant has 10 business days to respond with legal action before the listing is restored.',
  notesPlaceholder: 'Add notes about this resolution…',
  submitted: 'Submitted',
  resolved: 'Resolved',
};

export default function TakedownsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TakedownStatus | ''>('');
  const [kindFilter, setKindFilter] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [events, setEvents] = useState<ReadonlyArray<TakedownEvent>>([]);
  const [resolveBusy, setResolveBusy] = useState(false);

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

  // When the drawer opens for a row, attempt to load the event trail for it.
  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    const id = selected.request_id;
    let cancelled = false;
    (async () => {
      try {
        const json = await fetcher<{ events?: TakedownEvent[] }>(
          `/v1/takedowns/${encodeURIComponent(id)}/events`,
        );
        if (!cancelled) setEvents(json.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function handleResolve(decision: ResolveDecision, notes: string) {
    if (!selected) return;
    setResolveBusy(true);
    try {
      await fetcher(`/v1/takedowns/${selected.request_id}/resolve`, {
        method: 'POST',
        body: { decision, resolution_notes: notes || undefined },
      });
      setSelected(null);
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
      format: (val) => String(val),
    },
    {
      key: 'status',
      header: 'Status',
      type: 'string',
      format: (val) => String(val),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      type: 'number',
      format: (val) => {
        if (!val) return '—';
        return new Date(val as number).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      },
    },
    {
      key: 'request_id',
      header: '',
      type: 'string',
      format: (_val, row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected(row)}
            className="text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            Quick view
          </button>
          <Link
            href={adminConsole('takedown-detail', { id: row.request_id })}
            data-testid={`takedown-detail-${row.request_id}`}
            className="text-xs font-medium text-brand-600 hover:text-brand-800"
          >
            View details
          </Link>
        </div>
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
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-slate-900">Takedown Details</h2>
                <Link
                  href={adminConsole('takedown-detail', { id: selected.request_id })}
                  className="text-xs text-brand-600 hover:text-brand-800"
                >
                  Open in full page →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close detail panel"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 px-6 py-4">
              <TakedownDetailPanel
                request={selected}
                events={events}
                labels={DRAWER_LABELS}
                onResolve={resolveBusy ? undefined : handleResolve}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}