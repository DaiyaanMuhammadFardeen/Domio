'use client';

import type { ConversionFunnel as ConversionFunnelData } from '../../lib/types';

export interface ConversionFunnelProps {
  funnel: ConversionFunnelData;
}

interface Stage {
  readonly key: 'views' | 'trials' | 'purchases';
  readonly label: string;
  readonly value: number;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

/**
 * Three-stage horizontal conversion funnel (views → trials → purchases)
 * with a conversion rate chip between each pair of stages.
 */
export function ConversionFunnel({ funnel }: ConversionFunnelProps) {
  const stages: ReadonlyArray<Stage> = [
    { key: 'views', label: 'Views', value: funnel.views },
    { key: 'trials', label: 'Trials', value: funnel.trial_starts },
    { key: 'purchases', label: 'Purchases', value: funnel.purchases },
  ];

  const arrows: ReadonlyArray<{ rate: number; label: string }> = [
    { rate: funnel.view_to_trial_rate, label: 'View → trial' },
    { rate: funnel.trial_to_purchase_rate, label: 'Trial → purchase' },
  ];

  const maxValue = stages.reduce((m, s) => Math.max(m, s.value), 1);

  return (
    <div
      data-testid="conversion-funnel"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-stretch gap-2">
        {stages.map((stage, i) => {
          const widthPct = Math.max(8, (stage.value / maxValue) * 100);
          return (
            <div key={stage.key} className="flex flex-1 items-stretch gap-2">
              <div
                data-testid={`funnel-stage-${stage.key}`}
                className="flex flex-1 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                style={{ minWidth: `${widthPct}%` }}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {stage.label}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {formatCount(stage.value)}
                </div>
              </div>
              {i < stages.length - 1 ? (
                <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 text-center">
                  <div
                    data-testid={`funnel-rate-${stage.key}`}
                    className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold tabular-nums text-brand-700"
                  >
                    {formatRate(arrows[i]!.rate)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {arrows[i]!.label}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-xs">
        <span className="font-medium uppercase tracking-wide text-slate-500">
          Overall conversion
        </span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {formatRate(funnel.overall_conversion_rate)}
        </span>
      </div>
    </div>
  );
}
