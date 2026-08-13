'use client';

/**
 * Audit log table — Wave 8 §S8.4.
 *
 * Paginated table (20 rows / page) for audit events. Rows are clickable
 * to open the DetailDrawer.
 */

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { AuditEvent } from '../../lib/types';

const PAGE_SIZE = 20;

export interface LogTableProps {
  events: ReadonlyArray<AuditEvent>;
  onSelect: (id: string) => void;
  emptyMessage?: string;
}

function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function actorLabel(event: AuditEvent): string {
  if (event.actor.email) return event.actor.email;
  return `${event.actor.id} (${event.actor.kind})`;
}

function actionTone(action: AuditEvent['action']): 'brand' | 'grey' | 'amber' | 'green' | 'red' {
  if (action.startsWith('user.')) return 'brand';
  if (action.startsWith('deck.')) return 'grey';
  if (action.startsWith('dlp.')) return 'amber';
  if (action.startsWith('sso.')) return 'brand';
  if (action.startsWith('plugin.')) return 'green';
  if (action.startsWith('apikey.')) return 'red';
  if (action.startsWith('residency.') || action.startsWith('legal-hold.')) return 'red';
  if (action.startsWith('webhook.')) return 'amber';
  return 'grey';
}

export function LogTable({
  events,
  onSelect,
  emptyMessage = 'No events match these filters.',
}: LogTableProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageItems = useMemo(() => events.slice(start, start + PAGE_SIZE), [events, start]);

  // Reset to first page when the result set shrinks past current page.
  if (page !== 0 && safePage !== page) {
    setPage(0);
  }

  if (events.length === 0) {
    return (
      <div
        data-testid="audit-log-table-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="audit-log-table"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                When
              </th>
              <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                Actor
              </th>
              <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                Action
              </th>
              <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                Target
              </th>
              <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                Trace
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((event) => (
              <tr
                key={event.id}
                data-testid={`audit-row-${event.id}`}
                onClick={() => onSelect(event.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(event.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View detail for event ${event.id}`}
                className="cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-slate-600"
                  title={new Date(event.timestamp_ms).toISOString()}
                >
                  {formatRelTime(event.timestamp_ms)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                        event.actor.kind === 'user' && 'bg-brand-500',
                        event.actor.kind === 'service' && 'bg-amber-500',
                        event.actor.kind === 'system' && 'bg-slate-400',
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{actorLabel(event)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                      actionTone(event.action) === 'brand' && 'bg-brand-50 text-brand-700',
                      actionTone(event.action) === 'grey' && 'bg-slate-100 text-slate-700',
                      actionTone(event.action) === 'amber' && 'bg-amber-50 text-amber-700',
                      actionTone(event.action) === 'green' && 'bg-emerald-50 text-emerald-700',
                      actionTone(event.action) === 'red' && 'bg-rose-50 text-rose-700',
                    )}
                  >
                    {event.action}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {event.target_type}
                  </span>
                  <span className="ml-2 font-mono text-xs text-slate-700">{event.target_id}</span>
                </td>
                <td
                  className="max-w-[180px] truncate whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-slate-500"
                  title={event.trace_id}
                >
                  {event.trace_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-700">{start + 1}</span>–
          <span className="font-semibold text-slate-700">
            {Math.min(start + PAGE_SIZE, events.length)}
          </span>{' '}
          of <span className="font-semibold text-slate-700">{events.length}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="audit-pagination-prev"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page <span className="font-semibold text-slate-700">{safePage + 1}</span> /{' '}
            <span className="font-semibold text-slate-700">{totalPages}</span>
          </span>
          <button
            type="button"
            data-testid="audit-pagination-next"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
