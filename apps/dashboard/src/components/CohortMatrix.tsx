'use client';

import { useMemo } from 'react';
import { clsx } from 'clsx';
import type { CohortMatrix as CohortMatrixShape, CohortRow } from '../lib/cohort-service';

/**
 * Tailwind background utilities ordered cold → hot. The cohort
 * heat-grid uses these as opacity tiers so we never reach for raw
 * hex literals — light/dark theming stays in sync with the rest
 * of the dashboard via the slate scale.
 */
const TONE_BG = [
  'bg-slate-100',
  'bg-brand-50',
  'bg-brand-100',
  'bg-brand-200',
  'bg-brand-300',
  'bg-brand-400',
  'bg-brand-500',
  'bg-brand-600',
  'bg-brand-700',
  'bg-emerald-600',
] as const;

function tierFor(value: number): number {
  // Clamp to [0, 1], then bucket into 10 tiers. Returning 0 means
  // "no data" so the column stays muted.
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return TONE_BG.length - 1;
  const idx = Math.ceil(value * (TONE_BG.length - 1));
  return Math.max(1, Math.min(TONE_BG.length - 1, idx));
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export interface CohortMatrixProps {
  matrix: CohortMatrixShape;
}

/**
 * Renders the cohort retention grid: rows = join-week cohorts,
 * columns = week-N retention. Each cell is tinted by the
 * retention rate (cold = slate, hot = emerald). Hover shows the
 * exact percent + cohort size.
 */
export function CohortMatrix({ matrix }: CohortMatrixProps) {
  const width = Math.max(
    matrix.weeks,
    matrix.rows.reduce((m, r) => Math.max(m, r.retention.length), 0),
  );
  const cols = useMemo(() => Array.from({ length: Math.max(1, width) }, (_, i) => i), [width]);

  if (matrix.rows.length === 0) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
        data-testid="cohort-empty"
        role="status"
      >
        No cohort data — connect the warehouse or expand the time window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <table className="min-w-full text-xs" data-testid="cohort-matrix">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-slate-50 px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-slate-500"
            >
              Cohort
            </th>
            <th
              scope="col"
              className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-500"
            >
              Size
            </th>
            {cols.map((w) => (
              <th
                key={w}
                scope="col"
                className="px-1 py-1.5 text-center font-semibold uppercase tracking-wide text-slate-500"
              >
                W{w + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row: CohortRow) => (
            <tr key={row.joinWeek} className="border-t border-slate-100">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-medium text-slate-700"
              >
                {row.joinWeek}
              </th>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{row.size}</td>
              {cols.map((w) => {
                const v = row.retention[w] ?? 0;
                const tier = tierFor(v);
                return (
                  <td
                    key={w}
                    className="p-0.5"
                    title={`${row.joinWeek} · W${w + 1} · ${fmtPct(v)} of ${row.size}`}
                  >
                    <div
                      className={clsx(
                        'flex h-8 w-14 items-center justify-center rounded text-[10px] font-medium tabular-nums',
                        TONE_BG[tier],
                        tier >= 6 ? 'text-white' : 'text-slate-700',
                      )}
                      data-testid="cohort-cell"
                      data-cohort={row.joinWeek}
                      data-week={w + 1}
                      data-value={v}
                    >
                      {fmtPct(v)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
