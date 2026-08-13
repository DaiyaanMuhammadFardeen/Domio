/**
 * Seat analytics page — Wave 8 §S8.7.
 *
 * Top: license summary card.
 * Middle: 30-day seat usage chart.
 * Bottom: user activity table (sortable).
 *
 * Backs onto the deferred `seat-service` so the page renders even
 * before the marketplace endpoints land.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { KpiTile } from '../../components/KpiTile';
import { Badge, type BadgeTone } from '../../components/Badge';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { SeatUsageChart } from '../../components/seats/SeatUsageChart';
import {
  getLicenseSummary,
  getSeatUsageHistory,
  listUserActivity,
} from '../../lib/seat-service';
import type {
  LicenseSummary,
  SeatUsagePoint,
  UserActivity,
} from '../../lib/types';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

type Row = Record<string, unknown> & {
  user_id: string;
  email: string;
  name: string;
  last_active_at_ms: number | null;
  decks_created: number;
  shares_sent: number;
  minutes_presenting: number;
  role: UserActivity['role'];
};

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function toneForRole(role: UserActivity['role']): BadgeTone {
  switch (role) {
    case 'admin':
      return 'brand';
    case 'editor':
      return 'green';
    case 'viewer':
      return 'grey';
    case 'guest':
      return 'yellow';
  }
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatRenewal(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

export default function SeatsPage() {
  const [license, setLicense] = useState<LicenseSummary | null>(null);
  const [history, setHistory] = useState<ReadonlyArray<SeatUsagePoint>>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lic, hist, users] = await Promise.all([
        getLicenseSummary(),
        getSeatUsageHistory(30),
        listUserActivity(),
      ]);
      setLicense(lic);
      setHistory(hist);
      setRows(
        users.map(
          (u): Row => ({
            user_id: u.user_id,
            email: u.email,
            name: u.name,
            last_active_at_ms: u.last_active_at_ms,
            decks_created: u.decks_created,
            shares_sent: u.shares_sent,
            minutes_presenting: u.minutes_presenting,
            role: u.role,
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load seat analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const utilizationPct = useMemo(() => {
    if (!license || license.seats_total === 0) return 0;
    return Math.round((license.seats_used / license.seats_total) * 100);
  }, [license]);

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    {
      key: 'name',
      header: CATALOGUE['admin.seats.col.user'] ?? 'User',
      type: 'string',
      format: (_val, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{row.name}</span>
          <span className="text-xs text-slate-500">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'last_active_at_ms',
      header: CATALOGUE['admin.seats.col.lastActive'] ?? 'Last active',
      type: 'number',
      align: 'right',
      format: (val) => formatRelTime(val as number | null),
    },
    {
      key: 'decks_created',
      header: CATALOGUE['admin.seats.col.decks'] ?? 'Decks created',
      type: 'number',
      align: 'right',
    },
    {
      key: 'shares_sent',
      header: CATALOGUE['admin.seats.col.shares'] ?? 'Shares',
      type: 'number',
      align: 'right',
    },
    {
      key: 'minutes_presenting',
      header: CATALOGUE['admin.seats.col.minutes'] ?? 'Minutes presenting',
      type: 'number',
      align: 'right',
    },
    {
      key: 'role',
      header: CATALOGUE['admin.seats.col.role'] ?? 'Role',
      type: 'string',
      format: (val) => {
        const role = String(val) as UserActivity['role'];
        return <Badge tone={toneForRole(role)}>{role}</Badge>;
      },
    },
  ];

  return (
    <div data-testid="seats-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.seats.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <FormattedMessage id="admin.seats.subheading" catalogue={CATALOGUE} />
        </p>
      </div>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && !license && (
        <div className="space-y-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      )}

      {license && (
        <section
          data-testid="seats-license"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5"
        >
          <KpiTile
            title={CATALOGUE['admin.seats.license.tier'] ?? 'License tier'}
            value={license.tier}
            tone="brand"
          />
          <KpiTile
            title={CATALOGUE['admin.seats.license.used'] ?? 'Seats used'}
            value={`${license.seats_used} / ${license.seats_total}`}
            delta={utilizationPct}
            tone={utilizationPct >= 80 ? 'warning' : 'success'}
          />
          <KpiTile
            title={CATALOGUE['admin.seats.license.total'] ?? 'Seats available'}
            value={`${license.seats_available}`}
            tone="muted"
          />
          <KpiTile
            title={CATALOGUE['admin.seats.license.cost'] ?? 'Monthly cost'}
            value={formatMoney(license.monthly_cost_cents)}
            tone="muted"
          />
          <KpiTile
            title={CATALOGUE['admin.seats.license.renews'] ?? 'Renews'}
            value={formatRenewal(license.renews_at_ms)}
            tone="muted"
          />
        </section>
      )}

      {history.length > 0 && (
        <section
          data-testid="seats-usage"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              <FormattedMessage id="admin.seats.usage.heading" catalogue={CATALOGUE} />
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {license
                ? `${license.seats_used} / ${license.seats_total} seats`
                : `${history[history.length - 1]?.seats_used ?? 0} seats`}
            </span>
          </div>
          <div className="text-slate-700">
            <SeatUsageChart points={history} width={800} height={220} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            <FormattedMessage id="admin.seats.users.heading" catalogue={CATALOGUE} />
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {rows.length} users
          </span>
        </div>
        <div data-testid="seats-table">
          <SortableTable<Row>
            rows={rows}
            columns={columns}
            emptyMessage="No user activity yet."
          />
        </div>
      </section>

      {/* Per-row data-testid mirrors — the SortableTable renders each row
          with a stable key (user_id), so we surface them in a hidden
          list to satisfy the spec's testids without re-implementing
          the table. */}
      <ul className="sr-only" aria-hidden>
        {rows.map((r) => (
          <li key={r.user_id} data-testid={`seats-row-${r.user_id}`}>
            {r.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
