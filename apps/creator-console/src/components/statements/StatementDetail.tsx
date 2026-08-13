'use client';

import { Badge, type BadgeTone } from '../Badge';
import type { Statement, StatementStatus } from '../../lib/types';

export interface StatementDetailProps {
  readonly statement: Statement | null;
}

function toneForStatus(status: StatementStatus): BadgeTone {
  switch (status) {
    case 'draft':
      return 'grey';
    case 'finalized':
      return 'amber';
    case 'paid':
      return 'green';
    case 'disputed':
      return 'red';
  }
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function StatementDetail({ statement }: StatementDetailProps) {
  if (!statement) {
    return (
      <div
        data-testid="statement-detail"
        className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
      >
        Select a statement to view details.
      </div>
    );
  }

  return (
    <div
      data-testid="statement-detail"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{statement.period_month}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Creator {statement.creator_id}</p>
        </div>
        <Badge tone={toneForStatus(statement.status)}>{statement.status}</Badge>
      </header>

      <section data-testid="statement-detail-lines" aria-labelledby="statement-lines-heading">
        <h3
          id="statement-lines-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          Line items
        </h3>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Listing
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Units
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Gross
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Fees
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Refunds
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statement.lines.map((line) => (
                <tr
                  key={line.listing_id}
                  data-testid={`statement-line-${line.listing_id}`}
                  className="hover:bg-slate-50"
                >
                  <td className="px-3 py-2 text-slate-900">{line.listing_title}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{line.units}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatCurrency(line.gross_cents, statement.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {formatCurrency(line.fees_cents, statement.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {formatCurrency(line.refunds_cents, statement.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                    {formatCurrency(line.net_cents, statement.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        data-testid="statement-detail-totals"
        aria-labelledby="statement-totals-heading"
        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <h3
          id="statement-totals-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          Totals
        </h3>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Gross</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
              {formatCurrency(statement.gross_cents, statement.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Fees</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
              {formatCurrency(statement.fees_cents, statement.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Refunds</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
              {formatCurrency(statement.refunds_cents, statement.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Net</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-brand-700">
              {formatCurrency(statement.net_cents, statement.currency)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
