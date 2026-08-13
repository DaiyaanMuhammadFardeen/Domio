'use client';

/**
 * NegotiationLog — timeline of every adjustment on a two-way slide.
 *
 * Per Wave 11 §S11.7 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Each row shows:
 *   - Timestamp (HH:MM:SS.mmm)
 *   - Who moved it (presenter / audience member)
 *   - From / to value
 *   - The new midpoint after the adjustment
 */

import { useMemo, type ReactElement } from 'react';

import type { BidirAdjustment } from '../../lib/two-way-service';

export interface NegotiationLogProps {
  readonly adjustments: ReadonlyArray<BidirAdjustment>;
  readonly dataTestId?: string;
  /** Override the "empty" copy (used by tests). */
  readonly emptyLabel?: string;
  /** Override the heading (used by tests). */
  readonly heading?: string;
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number, w = 2): string => n.toString().padStart(w, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3,
  )}`;
}

function formatActor(adj: BidirAdjustment): string {
  if (adj.actor.type === 'presenter') return 'Presenter';
  return `Audience · ${adj.actor.name || adj.actor.id}`;
}

export function NegotiationLog({
  adjustments,
  dataTestId = 'negotiation-log',
  emptyLabel = 'No adjustments yet.',
  heading = 'Negotiation log',
}: NegotiationLogProps): ReactElement {
  const rows = useMemo(() => adjustments.slice().reverse(), [adjustments]);

  return (
    <section
      data-testid={dataTestId}
      data-row-count={adjustments.length}
      className="rounded-md border border-slate-700/60 bg-slate-900/40 p-3"
    >
      <h3 className="text-sm font-semibold text-slate-100" data-testid={`${dataTestId}-heading`}>
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400" data-testid={`${dataTestId}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-xs text-slate-200">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-2">Time</th>
                <th className="py-1 pr-2">Who</th>
                <th className="py-1 pr-2">From</th>
                <th className="py-1 pr-2">To</th>
                <th className="py-1 pr-2">New midpoint</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((adj) => (
                <tr
                  key={adj.id}
                  data-testid={`${dataTestId}-row-${adj.id}`}
                  className="border-t border-slate-700/60"
                >
                  <td className="py-1 pr-2 tabular-nums" data-testid={`${dataTestId}-time`}>
                    {formatTime(adj.timestamp_ms)}
                  </td>
                  <td className="py-1 pr-2" data-testid={`${dataTestId}-who`}>
                    {formatActor(adj)}
                  </td>
                  <td className="py-1 pr-2 tabular-nums" data-testid={`${dataTestId}-from`}>
                    {adj.from_value}
                  </td>
                  <td className="py-1 pr-2 tabular-nums" data-testid={`${dataTestId}-to`}>
                    {adj.to_value}
                  </td>
                  <td className="py-1 pr-2 tabular-nums" data-testid={`${dataTestId}-midpoint`}>
                    {adj.new_midpoint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
