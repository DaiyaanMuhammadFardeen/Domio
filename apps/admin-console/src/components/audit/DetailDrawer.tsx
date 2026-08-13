'use client';

/**
 * Audit log detail drawer — Wave 8 §S8.4.
 *
 * Slides in from the right when a row is selected. Shows the raw event
 * JSON plus a side-by-side before/after diff when present.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AuditEvent } from '../../lib/types';

export interface DetailDrawerProps {
  event: AuditEvent | null;
  open: boolean;
  onClose: () => void;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function DetailDrawer({ event, open, onClose }: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !event) return null;

  return (
    <div
      data-testid="audit-detail-drawer"
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Audit event detail"
    >
      <button
        type="button"
        aria-label="Close detail drawer"
        onClick={onClose}
        className="flex-1 bg-slate-900/40"
      />
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Event detail
            </div>
            <div className="mt-1 font-mono text-xs text-slate-700">{event.id}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">When</dt>
            <dd className="col-span-2 text-slate-800">{fmtDate(event.timestamp_ms)}</dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">Actor</dt>
            <dd className="col-span-2 text-slate-800">
              {event.actor.email ?? event.actor.id}{' '}
              <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {event.actor.kind}
              </span>
            </dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">Action</dt>
            <dd className="col-span-2 font-mono text-xs text-slate-800">{event.action}</dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">Target</dt>
            <dd className="col-span-2 text-slate-800">
              <span className="font-mono text-xs text-slate-500">{event.target_type}</span>
              <span className="ml-2 font-mono text-xs text-slate-800">{event.target_id}</span>
            </dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">Trace</dt>
            <dd className="col-span-2 break-all font-mono text-[11px] text-slate-500">{event.trace_id}</dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">Metadata</dt>
            <dd className="col-span-2">
              {Object.keys(event.metadata).length === 0 ? (
                <span className="text-xs text-slate-400">—</span>
              ) : (
                <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                  {stringify(event.metadata)}
                </pre>
              )}
            </dd>
          </dl>

          {event.diff && (
            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Diff</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
                    Before
                  </div>
                  <pre
                    data-testid="audit-detail-diff-before"
                    className="overflow-x-auto rounded-md border border-rose-200 bg-rose-50 p-3 font-mono text-[11px] leading-relaxed text-rose-900"
                  >
                    {stringify(event.diff.before)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                    After
                  </div>
                  <pre
                    data-testid="audit-detail-diff-after"
                    className="overflow-x-auto rounded-md border border-emerald-200 bg-emerald-50 p-3 font-mono text-[11px] leading-relaxed text-emerald-900"
                  >
                    {stringify(event.diff.after)}
                  </pre>
                </div>
              </div>
            </section>
          )}

          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Raw event</h3>
            <pre
              data-testid="audit-detail-json"
              className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100"
            >
              {stringify(event)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}