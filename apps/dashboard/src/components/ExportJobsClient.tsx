'use client';

/**
 * ExportJobsClient — queues dashboard export jobs and polls for
 * completion.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * "Queue" → POST /v1/exports/jobs.
 * "Poll"  → GET /v1/exports/jobs/{id} on a 2s interval while the job
 *           is in `queued` or `running`. The download link only
 *           renders once the job reaches `done` — no stub URLs.
 *
 * The component also lists recently-completed jobs on mount so the
 * page is never empty after the first export.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { clsx } from 'clsx';
import {
  getDashboardExport,
  listDashboardExports,
  queueDashboardExport,
  type DashboardExportFormat,
  type DashboardExportJob,
} from '../lib/export-service';

export interface ExportJobsClientProps {
  workspaceId?: string;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_MS = 2_000;

function formatAge(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function StatusBadge({ status }: { status: DashboardExportJob['status'] }): ReactElement {
  const tone = {
    queued: 'grey' as const,
    running: 'brand' as const,
    done: 'green' as const,
    failed: 'red' as const,
  }[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'green' && 'bg-emerald-50 text-emerald-700',
        tone === 'brand' && 'bg-brand-50 text-brand-700',
        tone === 'red' && 'bg-rose-50 text-rose-700',
        tone === 'grey' && 'bg-slate-100 text-slate-600',
      )}
    >
      {status}
    </span>
  );
}

export function ExportJobsClient({
  workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo',
  pollIntervalMs = DEFAULT_POLL_MS,
}: ExportJobsClientProps): ReactElement {
  const [jobs, setJobs] = useState<ReadonlyArray<DashboardExportJob>>([]);
  const [pending, setPending] = useState<DashboardExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing jobs on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await listDashboardExports(workspaceId);
      if (!cancelled) setJobs(list);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Poll in-flight jobs until they reach done/failed.
  useEffect(() => {
    const inflight = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (inflight.length === 0) return;
    let cancelled = false;
    const id = setInterval(async () => {
      const updates = await Promise.all(inflight.map((j) => getDashboardExport(workspaceId, j.id)));
      if (cancelled) return;
      setJobs((prev) => {
        const map = new Map(prev.map((j) => [j.id, j]));
        for (const u of updates) {
          if (u) map.set(u.id, u);
        }
        return [...map.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
      });
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobs, workspaceId, pollIntervalMs]);

  const queue = useCallback(
    async (format: DashboardExportFormat) => {
      setPending(format);
      setError(null);
      try {
        const job = await queueDashboardExport(workspaceId, format);
        setJobs((prev) => [job, ...prev]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(null);
      }
    },
    [workspaceId],
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          data-testid="queue-csv"
          disabled={pending !== null}
          onClick={() => queue('csv')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-brand-300 disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-slate-900">CSV export</div>
          <p className="mt-1 text-sm text-slate-500">
            Queue a CSV export of the current dashboard state and poll for completion. The download
            link appears once the job is ready.
          </p>
        </button>
        <button
          type="button"
          data-testid="queue-pdf"
          disabled={pending !== null}
          onClick={() => queue('pdf')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-brand-300 disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-slate-900">PDF export</div>
          <p className="mt-1 text-sm text-slate-500">
            Queue a PDF export. The download link appears once the export service reports the job as
            done.
          </p>
        </button>
      </section>

      {error ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          role="status"
          data-testid="export-error"
        >
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Export jobs
          </h2>
          <span className="text-xs text-slate-500">{jobs.length} jobs</span>
        </header>
        {jobs.length === 0 ? (
          <div
            className="px-4 py-6 text-center text-sm text-slate-500"
            role="status"
            data-testid="export-empty"
          >
            No exports yet. Queue a CSV or PDF export above to begin.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="export-job-list">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid="export-job"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-600">{j.format.toUpperCase()}</span>
                  <StatusBadge status={j.status} />
                  <span className="text-xs text-slate-500">{formatAge(j.createdAtMs)}</span>
                </div>
                {j.status === 'done' && j.downloadUrl ? (
                  <a
                    href={j.downloadUrl}
                    className="text-xs font-medium text-brand-600 hover:underline"
                    data-testid="export-download"
                  >
                    Download
                  </a>
                ) : j.status === 'failed' ? (
                  <span className="text-xs text-rose-600">Failed</span>
                ) : (
                  <span className="text-xs text-slate-500">Polling…</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
