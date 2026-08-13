/**
 * Custom Domains admin page — Wave 3 §S3.5.
 *
 * Lists every tenant's registered custom domains with their DNS
 * verification state. Admins can:
 *   - filter by tenant / state
 *   - register a new hostname
 *   - trigger a re-verification
 *   - revoke a domain (links fall back to deck.domio.app)
 *
 * Persistence is via the marketplace service's `/v1/custom-domains`
 * endpoints (S3.5 stub for now).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, ShieldOff } from 'lucide-react';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { Badge, toneForCustomDomainState } from '../../components/Badge';
import {
  listCustomDomains,
  verifyCustomDomain,
  revokeCustomDomain,
  CUSTOM_DOMAIN_STATE_TONES,
} from '../../lib/custom-domain-service';
import type { CustomDomainState } from '../../lib/types';

type Row = Record<string, unknown> & {
  id: string;
  hostname: string;
  tenant_id: string;
  label: string | null;
  state: CustomDomainState;
  last_checked_at_ms: number | null;
  last_check_note: string | null;
  cname_target: string;
  verified_at_ms: number | null;
};

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const ALL_STATES: readonly CustomDomainState[] = [
  'pending_dns',
  'verifying',
  'verified',
  'failed',
  'revoked',
];

export default function CustomDomainsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | CustomDomainState>('all');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    domain_id: string;
    cname_ok: boolean;
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listCustomDomains();
      const filtered = list.items.filter((d) => {
        if (tenantFilter && d.tenant_id !== tenantFilter) return false;
        if (stateFilter !== 'all' && d.state !== stateFilter) return false;
        return true;
      });
      setRows(
        filtered.map(
          (d): Row => ({
            id: d.id,
            hostname: d.hostname,
            tenant_id: d.tenant_id,
            label: d.label,
            state: d.state,
            last_checked_at_ms: d.last_checked_at_ms,
            last_check_note: d.last_check_note,
            cname_target: d.cname_target,
            verified_at_ms: d.verified_at_ms,
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load custom domains');
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, stateFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleVerify(row: Row) {
    setActionBusy(row.id);
    try {
      const res = await verifyCustomDomain(row.id);
      setVerifyResult({ domain_id: row.id, cname_ok: res.cname_ok, message: res.message });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRevoke(row: Row) {
    if (
      !window.confirm(
        `Revoke ${row.hostname}? Existing share links will fall back to deck.domio.app.`,
      )
    ) {
      return;
    }
    setActionBusy(row.id);
    try {
      await revokeCustomDomain(row.id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setActionBusy(null);
    }
  }

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    { key: 'hostname', header: 'Hostname', type: 'string' },
    { key: 'tenant_id', header: 'Tenant', type: 'string' },
    { key: 'label', header: 'Label', type: 'string' },
    {
      key: 'state',
      header: 'State',
      type: 'string',
      format: (val) => {
        const state = String(val) as CustomDomainState;
        return (
          <Badge tone={toneForCustomDomainState(state)}>
            {CUSTOM_DOMAIN_STATE_TONES[state] ? state : state}
          </Badge>
        );
      },
    },
    {
      key: 'cname_target',
      header: 'CNAME →',
      type: 'string',
      format: (val) => <code className="text-xs text-slate-600">{String(val)}</code>,
    },
    {
      key: 'last_checked_at_ms',
      header: 'Last Check',
      type: 'number',
      align: 'right',
      format: (val) => formatRelTime(val as number | null),
    },
    {
      key: 'last_check_note',
      header: 'Note',
      type: 'string',
      format: (val) => {
        const note = val as string | null;
        if (!note) return <span className="text-slate-400">—</span>;
        return <span className="text-xs text-slate-500">{note}</span>;
      },
    },
    {
      key: 'id',
      header: 'Actions',
      type: 'string',
      format: (_val, row) => {
        const busy = actionBusy === row.id;
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy || row.state === 'revoked'}
              onClick={() => handleVerify(row)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              aria-label={`Verify ${row.hostname}`}
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              Verify
            </button>
            {row.state !== 'revoked' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRevoke(row)}
                className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                aria-label={`Revoke ${row.hostname}`}
              >
                <ShieldOff className="h-3 w-3" aria-hidden />
                Revoke
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Custom Domains</h1>
          <p className="mt-1 text-sm text-slate-500">
            Per-tenant viewer hostnames. Verified domains rewrite share links from{' '}
            <code className="text-xs">deck.domio.app</code> to the tenant&apos;s hostname.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600" htmlFor="tenant-filter">
            Tenant
          </label>
          <input
            id="tenant-filter"
            type="text"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            placeholder="e.g. acme"
            className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <label className="text-xs font-medium text-slate-600" htmlFor="state-filter">
            State
          </label>
          <select
            id="state-filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as 'all' | CustomDomainState)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All</option>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-400 transition"
            title="Self-service add lands in §S3.6"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Domain
          </button>
        </div>
      </div>

      {verifyResult && (
        <div
          className={`mb-4 rounded-xl border p-4 text-sm ${
            verifyResult.cname_ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          role="status"
        >
          <strong className="font-semibold">
            {verifyResult.cname_ok ? 'Verification passed.' : 'Verification failed.'}
          </strong>{' '}
          {verifyResult.message}
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

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <SortableTable<Row>
          rows={rows}
          columns={columns}
          emptyMessage="No custom domains registered yet for this tenant."
        />
      )}
    </div>
  );
}
