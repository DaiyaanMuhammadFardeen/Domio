'use client';

import type { GeoBucket } from '../../lib/types';

export interface GeoDistributionProps {
  buckets: ReadonlyArray<GeoBucket>;
}

/**
 * Geographic distribution table — one row per `GeoBucket` with the
 * country code, full name, installs, and revenue. The list is left
 * in the order it was provided (the service sorts by revenue desc).
 */
export function GeoDistribution({ buckets }: GeoDistributionProps) {
  const maxRevenue = buckets.reduce((m, b) => Math.max(m, b.revenue_cents), 1);

  return (
    <div
      data-testid="geo-distribution"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Country
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Installs
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Revenue
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Share
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {buckets.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                No geographic data yet.
              </td>
            </tr>
          ) : (
            buckets.map((b) => {
              const pct = Math.max(0, Math.min(1, b.revenue_cents / maxRevenue));
              return (
                <tr
                  key={b.country_code}
                  data-testid={`geo-row-${b.country_code}`}
                  className="hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="font-medium text-slate-900">{b.country_name}</div>
                    <div className="text-xs text-slate-500">{b.country_code}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-800">
                    {b.installs.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-800">
                    {`$${(b.revenue_cents / 100).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`}
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-brand-500"
                        style={{ width: `${(pct * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
