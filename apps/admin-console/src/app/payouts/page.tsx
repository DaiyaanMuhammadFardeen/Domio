'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Clock, Users, TrendingUp } from 'lucide-react';
import { KpiTile } from '../../components/KpiTile';
import { Badge, toneForPayoutStatus } from '../../components/Badge';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { fetcher } from '../../lib/fetcher';
import type { PayoutPolicy, PayoutRun } from '../../lib/types';

type RunRow = Record<string, unknown> & PayoutRun;

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PayoutsPage() {
  const [policy, setPolicy] = useState<PayoutPolicy | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, runsRes] = await Promise.allSettled([
        fetcher<PayoutPolicy>('/v1/marketplace/payout-policy'),
        fetcher<PayoutRun[]>('/v1/payouts'),
      ]);

      if (policyRes.status === 'fulfilled') setPolicy(policyRes.value);
      if (runsRes.status === 'fulfilled') setRuns(runsRes.value as RunRow[]);

      // If both failed, show error
      if (policyRes.status === 'rejected' && runsRes.status === 'rejected') {
        throw policyRes.reason;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payout data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runColumns: ReadonlyArray<SortableColumn<RunRow>> = [
    { key: 'id', header: 'Run ID', type: 'string' },
    { key: 'period_month', header: 'Period', type: 'string' },
    {
      key: 'status',
      header: 'Status',
      type: 'string',
      format: (val) => <Badge tone={toneForPayoutStatus(String(val))}>{String(val)}</Badge>,
    },
    {
      key: 'total_creators',
      header: 'Creators',
      type: 'number',
      align: 'right',
    },
    {
      key: 'total_payout_cents',
      header: 'Total Payout',
      type: 'number',
      align: 'right',
      format: (val) => formatCents(Number(val)),
    },
    {
      key: 'currency',
      header: 'Currency',
      type: 'string',
    },
    {
      key: 'created_at_ms',
      header: 'Created',
      type: 'number',
      format: (val) => formatDate(val as number),
    },
    {
      key: 'completed_at_ms',
      header: 'Completed',
      type: 'number',
      format: (val) => formatDate(val as number),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payout Policy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Read-only view of the platform payout policy, split configuration, and historical payout
          runs.
        </p>
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="mt-2 h-7 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {policy && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              title="Creator Split"
              value={`${(policy.split_creator_bps / 100).toFixed(0)}%`}
              tone="success"
            />
            <KpiTile
              title="Platform Split"
              value={`${(policy.split_platform_bps / 100).toFixed(0)}%`}
              tone="brand"
            />
            <KpiTile
              title="Minimum Payout"
              value={formatCents(policy.min_payout_cents)}
              tone="muted"
            />
            <KpiTile
              title="First Payout Hold"
              value={`${policy.first_payout_hold_days} days`}
              tone="warning"
            />
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Policy Details
            </h2>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  Creator share (basis points)
                </dt>
                <dd className="font-mono text-sm font-semibold text-slate-900">
                  {policy.split_creator_bps}
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <DollarSign className="h-3.5 w-3.5" aria-hidden />
                  Platform share (basis points)
                </dt>
                <dd className="font-mono text-sm font-semibold text-slate-900">
                  {policy.split_platform_bps}
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <DollarSign className="h-3.5 w-3.5" aria-hidden />
                  Minimum payout (cents)
                </dt>
                <dd className="font-mono text-sm font-semibold text-slate-900">
                  {policy.min_payout_cents}
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  First payout hold (days)
                </dt>
                <dd className="font-mono text-sm font-semibold text-slate-900">
                  {policy.first_payout_hold_days}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Payout Runs
        </h2>
        {runs.length === 0 && !loading && !error && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden />
            No payout runs found.
          </div>
        )}
        {runs.length > 0 && (
          <SortableTable<RunRow>
            rows={runs}
            columns={runColumns}
            emptyMessage="No payout runs found."
          />
        )}
      </div>
    </div>
  );
}
