'use client';

/**
 * History — list of the last 20 prompts/jobs sent through the AI
 * Copilot. Each entry can be re-opened (load the conversation back into
 * the prompt input) or branched (start a new prompt seeded with the
 * prior one).
 *
 * Per Wave 6 §S6.1 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { CornerUpLeft, GitBranch, Clock } from 'lucide-react';
import { cn } from '../../lib/cn';
import { listJobs, type JobRecord } from '../../lib/ai-service';

const MAX_ENTRIES = 20;

export interface HistoryEntry {
  readonly jobId: string;
  readonly prompt: string;
  readonly status: JobRecord['status'];
  readonly createdAtMs: number;
}

export interface HistoryProps {
  /** Override loader — useful for tests. Defaults to `listJobs`. */
  readonly fetchHistory?: (limit: number) => Promise<ReadonlyArray<JobRecord>>;
  readonly onReopen?: (entry: HistoryEntry) => void;
  readonly onBranch?: (entry: HistoryEntry) => void;
  readonly limit?: number;
}

function jobsToEntries(jobs: ReadonlyArray<JobRecord>, limit: number): ReadonlyArray<HistoryEntry> {
  return jobs.slice(0, limit).map((j) => ({
    jobId: j.id,
    prompt: j.intent,
    status: j.status,
    createdAtMs: j.createdAtMs,
  }));
}

function formatRelative(ms: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function History({
  fetchHistory = listJobs,
  onReopen,
  onBranch,
  limit = MAX_ENTRIES,
}: HistoryProps): ReactElement {
  const [entries, setEntries] = useState<ReadonlyArray<HistoryEntry>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory(limit)
      .then((jobs) => {
        if (cancelled) return;
        setEntries(jobsToEntries(jobs, limit));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, limit]);

  return (
    <div className="flex flex-col gap-2" data-testid="copilot-history">
      <header className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        <Clock size={12} />
        <span>Recent</span>
      </header>

      {loading && entries.length === 0 ? (
        <p className="text-[11px] text-slate-500" data-testid="copilot-history-loading">
          Loading…
        </p>
      ) : null}

      {error && entries.length === 0 ? (
        <p
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
          data-testid="copilot-history-error"
          role="alert"
        >
          {error.message}
        </p>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <p
          className="text-[11px] text-slate-500"
          data-testid="copilot-history-empty"
        >
          No recent prompts yet. Your last 20 prompts will appear here.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5" data-testid="copilot-history-list">
        {entries.map((entry) => (
          <li
            key={entry.jobId}
            className={cn(
              'group rounded-md border border-slate-700/50 bg-slate-800/40 px-2 py-1.5',
              'transition-colors hover:border-slate-600 hover:bg-slate-800/70',
            )}
            data-testid={`copilot-history-item-${entry.jobId}`}
          >
            <button
              type="button"
              className="block w-full truncate text-left text-[12px] font-medium text-slate-200"
              onClick={() => onReopen?.(entry)}
              data-testid={`copilot-history-reopen-${entry.jobId}`}
              aria-label={`Reopen prompt: ${entry.prompt}`}
            >
              {entry.prompt || '(untitled prompt)'}
            </button>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>{formatRelative(entry.createdAtMs)} ago · {entry.status}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
                onClick={() => onBranch?.(entry)}
                data-testid={`copilot-history-branch-${entry.jobId}`}
                aria-label={`Branch from prompt: ${entry.prompt}`}
              >
                <GitBranch size={10} />
                <span>Branch</span>
                <CornerUpLeft size={10} className="hidden" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
