'use client';

import { clsx } from 'clsx';
import { Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { MigrationPlan } from '../../lib/types';

export interface MigrationProgressProps {
  readonly plan: MigrationPlan;
}

/**
 * Visual progress tracker for an in-flight migration. Renders a
 * horizontal bar plus the status indicator. Stays compact so the
 * parent page can show it inline next to the workspace table.
 */
export function MigrationProgress({ plan }: MigrationProgressProps) {
  const pct = Math.max(0, Math.min(100, plan.progress_pct));
  const isInProgress = plan.status === 'in_progress';
  const isCompleted = plan.status === 'completed';
  const isFailed = plan.status === 'failed';

  const StatusIcon = isInProgress
    ? Activity
    : isCompleted
      ? CheckCircle2
      : isFailed
        ? XCircle
        : Clock;

  const statusLabel = isInProgress
    ? 'In progress'
    : isCompleted
      ? 'Completed'
      : isFailed
        ? 'Failed'
        : 'Pending';

  return (
    <div
      data-testid="migration-progress"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={clsx(
              'h-4 w-4',
              isInProgress && 'animate-pulse text-brand-600',
              isCompleted && 'text-emerald-600',
              isFailed && 'text-rose-600',
              !isInProgress && !isCompleted && !isFailed && 'text-slate-500',
            )}
            aria-hidden
          />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Migration in progress
          </h3>
        </div>
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
            isInProgress && 'bg-brand-50 text-brand-700',
            isCompleted && 'bg-emerald-50 text-emerald-700',
            isFailed && 'bg-rose-50 text-rose-700',
            !isInProgress && !isCompleted && !isFailed && 'bg-slate-100 text-slate-600',
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {plan.from_region} → {plan.to_region}
        </span>
        <span data-testid="migration-progress-pct" className="font-semibold tabular-nums">
          {pct}%
        </span>
      </div>

      <div
        data-testid="migration-progress-bar"
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300',
            isCompleted && 'bg-emerald-500',
            isFailed && 'bg-rose-500',
            isInProgress && 'bg-brand-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Storage
          </span>
          <span className="font-medium tabular-nums text-slate-700">
            {plan.estimated_storage_gb.toLocaleString()} GB
          </span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Estimated cost
          </span>
          <span className="font-medium tabular-nums text-slate-700">
            ${(plan.estimated_cost_cents / 100).toFixed(2)}
          </span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Estimated downtime
          </span>
          <span className="font-medium tabular-nums text-slate-700">
            {plan.estimated_downtime_minutes} min
          </span>
        </div>
      </div>
    </div>
  );
}
