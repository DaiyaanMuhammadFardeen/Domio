'use client';

import type { TopListing } from '../../lib/types';

export interface TopListingsTableProps {
  listings: ReadonlyArray<TopListing>;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Table of the creator's top listings by revenue.
 */
export function TopListingsTable({ listings }: TopListingsTableProps) {
  return (
    <div
      data-testid="top-listings-table"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Listing
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Revenue
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Units sold
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Conversion
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {listings.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                No listings yet.
              </td>
            </tr>
          ) : (
            listings.map((l) => (
              <tr
                key={l.listing_id}
                data-testid={`top-listing-row-${l.listing_id}`}
                className="hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
                  {l.title}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-800">
                  {formatCurrency(l.revenue_cents)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-800">
                  {l.units_sold.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-800">
                  {formatPercent(l.conversion_rate)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
