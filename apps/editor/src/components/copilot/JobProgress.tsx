'use client';

/**
 * JobProgress — renders the live status of an AI planner job.
 *
 * Per Wave 6 §S6.1 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Polls `GET /v1/ai/jobs/{id}` every 2s (configurable) and surfaces
 * four phases: planning → outlining → designing → citing. Stops
 * polling once the job has reached a terminal state (succeeded,
 * failed, cancelled) or the component unmounts.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  getJob,
  type JobPhase,
  type JobRecord,
  type JobStatus,
} from '../../lib/ai-service';

const PHASE_ORDER: readonly JobPhase[] = ['planning', 'outlining', 'designing', 'citing'];

export interface JobProgressProps {
  readonly jobId: string;
  readonly pollIntervalMs?: number;
  readonly onComplete?: (job: JobRecord) => void;
  readonly onError?: (err: Error, job: JobRecord | null) => void;
  /** Override the fetcher — useful for tests. Defaults to `getJob`. */
  readonly fetchJob?: (id: string) => Promise<JobRecord>;
}

function isTerminal(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export function JobProgress({
  jobId,
  pollIntervalMs = 2000,
  onComplete,
  onError,
  fetchJob = getJob,
}: JobProgressProps): ReactElement {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const completedRef = useRef<JobRecord | null>(null);
  const errRef = useRef<Error | null>(null);

  useEffect(() => {
    completedRef.current = null;
    errRef.current = null;
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const next = await fetchJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (isTerminal(next.status)) {
          if (!completedRef.current) {
            completedRef.current = next;
            onComplete?.(next);
          }
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        if (!errRef.current) {
          errRef.current = e;
          onError?.(e, job);
        }
      }
    };

    // Fire one immediate fetch, then poll.
    void tick();
    const handle = window.setInterval(() => {
      void tick();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
    // We intentionally exclude `onComplete` / `onError` so the polling
    // cadence does not restart when consumers pass new closures.
  }, [jobId, pollIntervalMs, fetchJob]);

  const status = job?.status ?? 'queued';
  const phase = job?.phase ?? 'planning';

  return (
    <div className="flex flex-col gap-3" data-testid="job-progress">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-blue-400" />
        <span className="text-xs font-medium text-slate-200">Job {jobId.slice(0, 8)}</span>
        <StatusPill status={status} />
      </div>

      <ol className="space-y-2" data-testid="job-progress-phases">
        {PHASE_ORDER.map((p, idx) => {
          const reached = PHASE_ORDER.indexOf(phase) >= idx;
          const isCurrent = p === phase && !isTerminal(status);
          const isDone = (isTerminal(status) && reached) || (reached && PHASE_ORDER.indexOf(phase) > idx);
          return (
            <li
              key={p}
              className="flex items-center gap-2 text-xs"
              data-testid={`job-progress-phase-${p}`}
            >
              <PhaseIcon done={isDone} current={isCurrent} />
              <span
                className={cn(
                  'capitalize',
                  isDone ? 'text-slate-200' : isCurrent ? 'text-blue-300' : 'text-slate-500',
                )}
              >
                {p}
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div
          className="flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="job-progress-error"
          role="alert"
        >
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: JobStatus }): ReactElement {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        status === 'succeeded' && 'bg-emerald-500/15 text-emerald-400',
        status === 'failed' && 'bg-red-500/15 text-red-400',
        status === 'cancelled' && 'bg-slate-500/15 text-slate-400',
        (status === 'queued' || status === 'running') && 'bg-blue-500/15 text-blue-300',
      )}
      data-testid="job-progress-status"
    >
      {(status === 'queued' || status === 'running') ? (
        <Loader2 size={10} className="animate-spin" />
      ) : null}
      {status === 'succeeded' ? <Check size={10} /> : null}
      {label}
    </span>
  );
}

function PhaseIcon({ done, current }: { done: boolean; current: boolean }): ReactElement {
  if (done) {
    return (
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <Check size={10} />
      </span>
    );
  }
  if (current) {
    return (
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
        <Loader2 size={10} className="animate-spin" />
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-slate-700/60 bg-slate-800/40 text-slate-500">
      <span className="h-1 w-1 rounded-full bg-slate-600" />
    </span>
  );
}
