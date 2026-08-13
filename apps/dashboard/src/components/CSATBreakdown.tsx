'use client';

import { clsx } from 'clsx';
import type { CsatBreakdown as CsatBreakdownShape } from '../lib/sentiment-service';

export interface CSATBreakdownProps {
  data: CsatBreakdownShape;
}

const NPS_TONE: Record<'great' | 'ok' | 'bad', string> = {
  great: 'bg-emerald-600',
  ok: 'bg-amber-500',
  bad: 'bg-rose-600',
};

function npsTone(nps: number): 'great' | 'ok' | 'bad' {
  if (nps >= 50) return 'great';
  if (nps >= 0) return 'ok';
  return 'bad';
}

/**
 * Renders the CSAT + NPS breakdown. Top row shows totals +
 * headline NPS; below it the per-slide NPS bars. The component
 * is read-only — bars are static once rendered.
 */
export function CSATBreakdown({ data }: CSATBreakdownProps) {
  if (data.total === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
        data-testid="csat-empty"
        role="status"
      >
        No CSAT responses in this window.
      </div>
    );
  }

  const promoterPct = (data.promoter / data.total) * 100;
  const passivePct = (data.passive / data.total) * 100;
  const detractorPct = (data.detractor / data.total) * 100;

  return (
    <div className="space-y-4" data-testid="csat-breakdown">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">CSAT</div>
          <div
            className="mt-1 text-2xl font-semibold tabular-nums text-slate-900"
            data-testid="csat-pct"
          >
            {data.csatPct}%
          </div>
          <div className="mt-1 text-xs text-slate-500">{data.total} responses</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">NPS</div>
          <div
            className={clsx(
              'mt-1 inline-block rounded-md px-2 py-0.5 text-2xl font-semibold tabular-nums text-white',
              NPS_TONE[npsTone(data.nps)],
            )}
            data-testid="csat-nps"
          >
            {data.nps}
          </div>
          <div className="mt-1 text-xs text-slate-500">promoter − detractor</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Distribution
          </div>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <span
              className="bg-emerald-500"
              style={{ width: `${promoterPct}%` }}
              data-testid="csat-bar-promoter"
            />
            <span
              className="bg-amber-400"
              style={{ width: `${passivePct}%` }}
              data-testid="csat-bar-passive"
            />
            <span
              className="bg-rose-500"
              style={{ width: `${detractorPct}%` }}
              data-testid="csat-bar-detractor"
            />
          </div>
          <ul className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-500">
            <li>
              <span className="font-semibold text-emerald-700" data-testid="csat-count-promoter">
                {data.promoter}
              </span>{' '}
              promoter
            </li>
            <li>
              <span className="font-semibold text-amber-700" data-testid="csat-count-passive">
                {data.passive}
              </span>{' '}
              passive
            </li>
            <li>
              <span className="font-semibold text-rose-700" data-testid="csat-count-detractor">
                {data.detractor}
              </span>{' '}
              detractor
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Per-slide NPS</h3>
        <ul className="space-y-2" data-testid="csat-per-slide">
          {data.perSlide.map((row) => {
            const tone = npsTone(row.nps);
            return (
              <li
                key={row.slideId}
                className="flex items-center gap-3"
                data-testid="csat-per-slide-row"
                data-slide-id={row.slideId}
              >
                <span className="w-32 truncate font-mono text-xs text-slate-500">
                  {row.slideId}
                </span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={clsx('absolute left-0 top-0 h-full', NPS_TONE[tone])}
                    style={{
                      width: `${Math.min(100, Math.max(2, (row.nps + 100) / 2))}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-700">
                  {row.nps}
                </span>
                <span className="w-16 text-right text-[10px] text-slate-400 tabular-nums">
                  {row.count} resp
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
