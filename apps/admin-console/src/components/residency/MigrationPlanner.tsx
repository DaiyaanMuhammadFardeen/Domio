'use client';

import { useState } from 'react';
import { ArrowRight, Eye, Play } from 'lucide-react';
import { clsx } from 'clsx';
import type {
  MigrationPlan,
  MigrationPlanRequest,
  Region,
  RegionInfo,
  WorkspaceResidency,
} from '../../lib/types';

export interface MigrationPlannerProps {
  readonly workspace: WorkspaceResidency;
  readonly regions: ReadonlyArray<RegionInfo>;
  readonly onPreview: (req: MigrationPlanRequest) => Promise<MigrationPlan>;
  readonly onApply: (planId: string) => Promise<MigrationPlan>;
  readonly onApplied?: (plan: MigrationPlan) => void;
}

/**
 * Migration planner for a single workspace. Two-step flow:
 *   1. Pick a target region + click Preview → server returns a
 *      `MigrationPlan` with cost + downtime estimate.
 *   2. Click Apply to start the migration. The parent takes over
 *      rendering progress once `status === 'in_progress'`.
 */
export function MigrationPlanner({
  workspace,
  regions,
  onPreview,
  onApply,
  onApplied,
}: MigrationPlannerProps) {
  const candidate = regions.find((r) => r.id !== workspace.region);
  const [target, setTarget] = useState<Region>(
    workspace.region === 'us-east' ? 'us-west' : (candidate?.id ?? 'us-east'),
  );
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleRegions = regions.filter((r) => r.id !== workspace.region);

  async function handlePreview() {
    setError(null);
    setPreviewing(true);
    try {
      const next = await onPreview({ workspace_id: workspace.workspace_id, to_region: target });
      setPlan(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!plan) return;
    setError(null);
    setApplying(true);
    try {
      const updated = await onApply(plan.id);
      setPlan(updated);
      onApplied?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  const disabled = workspace.residency_locked;

  return (
    <div
      data-testid="migration-planner"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Migration plan
        </h3>
        {disabled && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Locked
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Current region
          </div>
          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            {workspace.region}
          </div>
        </div>
        <ArrowRight className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" aria-hidden />
        <div className="flex-1">
          <label
            htmlFor="migration-target-region"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Target region
          </label>
          <select
            id="migration-target-region"
            data-testid="migration-target-region"
            value={target}
            onChange={(e) => setTarget(e.target.value as Region)}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            {eligibleRegions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {r.city}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={disabled || previewing}
          data-testid="migration-preview"
          className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 sm:self-end"
        >
          <Eye className="h-4 w-4" aria-hidden />
          {previewing ? 'Previewing…' : 'Preview'}
        </button>
      </div>

      {error && (
        <div
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {plan && (
        <div
          data-testid="migration-estimate"
          className={clsx(
            'mt-5 rounded-lg border p-4 text-sm',
            plan.status === 'in_progress'
              ? 'border-brand-200 bg-brand-50 text-brand-900'
              : 'border-slate-200 bg-slate-50 text-slate-700',
          )}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                From → To
              </div>
              <div className="mt-0.5 font-semibold text-slate-800">
                {plan.from_region} → {plan.to_region}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Storage moved
              </div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-800">
                {plan.estimated_storage_gb.toLocaleString()} GB
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Estimated cost
                </span>
                <div
                  data-testid="migration-cost"
                  className="mt-0.5 font-semibold tabular-nums text-slate-800"
                >
                  ${(plan.estimated_cost_cents / 100).toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Estimated downtime
                </span>
                <div
                  data-testid="migration-downtime"
                  className="mt-0.5 font-semibold tabular-nums text-slate-800"
                >
                  {plan.estimated_downtime_minutes} min
                </div>
              </div>
            </div>
          </div>

          {plan.status === 'preview' && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                data-testid="migration-apply"
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden />
                {applying ? 'Applying…' : 'Apply migration'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
