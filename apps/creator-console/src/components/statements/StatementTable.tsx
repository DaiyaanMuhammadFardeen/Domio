'use client';

import { clsx } from 'clsx';
import { Badge, type BadgeTone } from '../Badge';
import type { Statement, StatementStatus } from '../../lib/types';

export interface StatementTableProps {
  readonly statements: ReadonlyArray<Statement>;
  readonly onSelect: (id: string) => void;
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

function formatCurrency(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function StatementTable({ statements, onSelect }: StatementTableProps) {
  return (
    <div
      data-testid="statements-table"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Period
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Gross
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Fees
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Refunds
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Net
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Generated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {statements.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-6 text-center text-sm text-slate-500"
              >
                No statements yet.
              </td>
            </tr>
          ) : (
            statements.map((statement) => (
              <tr
                key={statement.id}
                data-testid={`statement-row-${statement.id}`}
                onClick={() => onSelect(statement.id)}
                className={clsx('cursor-pointer hover:bg-slate-50')}
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                  {statement.period_month}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Badge tone={toneForStatus(statement.status)}>
                    {statement.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">
                  {formatCurrency(statement.gross_cents, statement.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatCurrency(statement.fees_cents, statement.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatCurrency(statement.refunds_cents, statement.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {formatCurrency(statement.net_cents, statement.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatDate(statement.generated_at_ms)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}