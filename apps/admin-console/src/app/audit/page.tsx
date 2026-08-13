/**
 * Audit log viewer page — Wave 8 §S8.4.
 *
 * Filter bar at the top, paginated event table in the main column,
 * slide-in detail drawer on row select, and an Export CSV action in
 * the bottom-right.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { FilterBar } from '../../components/audit/FilterBar';
import { LogTable } from '../../components/audit/LogTable';
import { DetailDrawer } from '../../components/audit/DetailDrawer';
import {
  listAuditEvents,
  getAuditEvent,
  exportAuditEventsCSV,
} from '../../lib/audit-service';
import type { AuditEvent, AuditFilter } from '../../lib/types';

const EMPTY_FILTER: AuditFilter = {};

export default function AuditPage() {
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_FILTER);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAuditEvents(filter);
      setEvents(list.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit events');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch detail when a row is selected; clear when none.
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSelectedEvent(null);
      return;
    }
    getAuditEvent(selectedId).then((ev) => {
      if (!cancelled) setSelectedEvent(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleExport = useCallback(async () => {
    setExportBusy(true);
    try {
      const csv = await exportAuditEventsCSV(filter);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Release the object URL after the click has been handled.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExportBusy(false);
    }
  }, [filter]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filter.actor_id !== undefined) n += 1;
    if (filter.action !== undefined) n += 1;
    if (filter.target_type !== undefined) n += 1;
    if (filter.from_ms !== undefined) n += 1;
    if (filter.to_ms !== undefined) n += 1;
    return n;
  }, [filter]);

  return (
    <div data-testid="audit-page" className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit Log</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Every privileged action by an admin, service, or system process.
            {activeCount > 0 && (
              <>
                {' '}
                <span className="font-medium text-slate-700">
                  {activeCount} filter{activeCount === 1 ? '' : 's'} active
                </span>
                .
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="audit-export-csv"
          disabled={exportBusy || events.length === 0}
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV
        </button>
      </header>

      <FilterBar filter={filter} onChange={setFilter} />

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : (
        <LogTable
          events={events}
          onSelect={setSelectedId}
          emptyMessage="No events match these filters."
        />
      )}

      <DetailDrawer
        event={selectedEvent}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}