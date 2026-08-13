'use client';

import { clsx } from 'clsx';
import { MapPin, Database } from 'lucide-react';
import type { Region, RegionInfo } from '../../lib/types';

export interface RegionSelectorProps {
  readonly regions: ReadonlyArray<RegionInfo>;
  readonly selected: Region | null;
  readonly onSelect: (r: Region) => void;
}

/**
 * Card grid of every available data-residency region. Each card
 * surfaces the label, city, workspace count, and total storage so
 * admins can eyeball load distribution across regions.
 */
export function RegionSelector({ regions, selected, onSelect }: RegionSelectorProps) {
  return (
    <div
      data-testid="region-selector"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {regions.map((region) => {
        const isSelected = selected === region.id;
        return (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelect(region.id)}
            data-testid={`region-card-${region.id}`}
            aria-pressed={isSelected}
            className={clsx(
              'group flex flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left shadow-sm transition',
              isSelected
                ? 'border-brand-500 ring-2 ring-brand-200'
                : 'border-slate-200 hover:border-brand-300 hover:shadow-md',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {region.country}
              </div>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  isSelected ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600',
                )}
              >
                {region.id}
              </span>
            </div>
            <div className="text-base font-semibold text-slate-900">{region.label}</div>
            <div className="text-xs text-slate-500">{region.city}</div>
            <div className="mt-2 flex w-full items-end justify-between border-t border-slate-100 pt-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Workspaces
                </div>
                <div className="text-sm font-semibold tabular-nums text-slate-700">
                  {region.count_workspaces}
                </div>
              </div>
              <div className="flex items-center gap-1 text-right">
                <Database className="h-3 w-3 text-slate-400" aria-hidden />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Storage
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-slate-700">
                    {region.storage_gb.toLocaleString()} GB
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
