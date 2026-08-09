import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export interface KpiTileProps {
  title: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  sparkline?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'muted' | 'danger';
}

/**
 * KPI tile lifted from dashboard. Admin-extended with a danger tone
 * for negative metrics like denied locks or pending takedowns.
 */
export function KpiTile({
  title,
  value,
  delta,
  deltaSuffix = '%',
  sparkline,
  tone = 'brand',
}: KpiTileProps) {
  const positive = typeof delta === 'number' && delta > 0;
  const negative = typeof delta === 'number' && delta < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
            tone === 'success' && 'bg-emerald-50 text-emerald-700',
            tone === 'warning' && 'bg-amber-50 text-amber-700',
            tone === 'danger' && 'bg-rose-50 text-rose-700',
            tone === 'brand' && 'bg-brand-50 text-brand-700',
            tone === 'muted' && 'bg-slate-100 text-slate-500',
          )}
        >
          live
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className="text-2xl font-semibold tabular-nums text-slate-900">
          {value}
        </div>
        {typeof delta === 'number' ? (
          <div
            className={clsx(
              'flex items-center gap-0.5 text-xs font-medium',
              positive && 'text-emerald-600',
              negative && 'text-rose-600',
              !positive && !negative && 'text-slate-500',
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            <span className="tabular-nums">
              {Math.abs(delta).toFixed(1)}
              {deltaSuffix}
            </span>
          </div>
        ) : null}
      </div>
      {sparkline ? (
        <div className="mt-3 h-6 text-slate-500">{sparkline}</div>
      ) : null}
    </div>
  );
}
