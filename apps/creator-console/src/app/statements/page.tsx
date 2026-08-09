'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { useI18n } from '../../lib/i18n';
import type { StatementSummary } from '../../lib/types';
import { fetcher } from '../../lib/fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

function formatCurrency(cents: number, currency: string = 'USD'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function StatementsPage() {
  const { t } = useI18n();
  const [statements, setStatements] = useState<StatementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await fetcher<StatementSummary[]>(
          API_BASE,
          '/v1/creator/statements',
        );
        setStatements(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statements');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Note: The API spec doesn't include a generateCreatorStatement endpoint
  // Statements are generated automatically by the system

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading statements...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h3 className="text-sm font-semibold text-rose-800">Error loading statements</h3>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('statements.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            View and download your monthly and annual tax statements.
          </p>
        </div>

      </div>

      {statements.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-400" />
          <div className="mt-4 text-sm font-medium text-slate-900">{t('statements.empty')}</div>
          <p className="mt-1 text-sm text-slate-500">
            Statements are generated monthly after your first payout.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Type
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('statements.period')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('statements.gross')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('statements.fees')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('statements.net')}
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('statements.generated')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statements.map((statement) => (
                <tr key={statement.statement_id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={statement.kind === 'monthly' ? 'brand' : 'green'}>
                      {statement.kind === 'monthly' ? 'Monthly' : '1099-K'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                    {statement.period_month}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">
                    {formatCurrency(statement.total_gross_cents, statement.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatCurrency(statement.total_fee_cents, statement.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                    {formatCurrency(statement.total_net_cents, statement.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatDate(statement.generated_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                      <Download className="h-4 w-4" />
                      {t('statements.download')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
