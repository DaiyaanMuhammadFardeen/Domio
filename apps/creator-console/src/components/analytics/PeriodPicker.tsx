'use client';

import { clsx } from 'clsx';
import type { AnalyticsPeriod } from '../../lib/types';

export interface PeriodPickerProps {
  period: AnalyticsPeriod;
  onChange: (p: AnalyticsPeriod) => void;
}

const PERIODS: ReadonlyArray<{ value: AnalyticsPeriod; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
];

/**
 * Tab strip for selecting the analytics period.
 * Emits the new period via `onChange` when the user picks a tab.
 */
export function PeriodPicker({ period, onChange }: PeriodPickerProps) {
  return (
    <div
      data-testid="period-picker"
      role="tablist"
      aria-label="Analytics period"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm"
    >
      {PERIODS.map((p) => {
        const active = p.value === period;
        return (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`period-${p.value}`}
            onClick={() => onChange(p.value)}
            className={clsx(
              'rounded-md px-3 py-1.5 font-medium transition',
              active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
