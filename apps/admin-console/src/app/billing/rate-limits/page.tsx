'use client';

/**
 * Rate-limit editor — Wave 10 §S10.6.
 *
 * List every configured rule with its current usage, and let admins
 * add/edit/delete via a slide-over drawer. The drawer is shared with the
 * "add new" flow so the form schema is identical.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { SortableTable, type SortableColumn } from '../../../components/SortableTable';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { RateLimitRuleDrawer } from '../../../components/billing/RateLimitRuleDrawer';
import enMessages from '../../../../messages/en.json';
import {
  createRateLimitRule,
  deleteRateLimitRule,
  listRateLimitRules,
  updateRateLimitRule,
  type RateLimitRule,
  type RateLimitRuleInput,
  type RateLimitScope,
  type RateLimitWindow,
} from '../../../lib/billing-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function t(id: string): string {
  return CATALOGUE[id] ?? id;
}

const SCOPE_LABEL: Readonly<Record<RateLimitScope, string>> = {
  per_key: 'admin.billing.rateLimits.scope.perKey',
  per_agent: 'admin.billing.rateLimits.scope.perAgent',
  per_ip: 'admin.billing.rateLimits.scope.perIp',
};

const WINDOW_LABEL: Readonly<Record<RateLimitWindow, string>> = {
  '1m': 'admin.billing.rateLimits.window.1m',
  '5m': 'admin.billing.rateLimits.window.5m',
  '1h': 'admin.billing.rateLimits.window.1h',
  '1d': 'admin.billing.rateLimits.window.1d',
};

function toneForUsageRatio(usage: number, limit: number): BadgeTone {
  if (limit <= 0) return 'grey';
  const ratio = usage / limit;
  if (ratio >= 0.9) return 'red';
  if (ratio >= 0.6) return 'amber';
  return 'green';
}

type Row = Record<string, unknown> & RateLimitRule;

export default function RateLimitsPage() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RateLimitRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listRateLimitRules();
      setRules(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rate limits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const columns: ReadonlyArray<SortableColumn<Row>> = useMemo(
    () => [
      {
        key: 'scope',
        header: t('admin.billing.rateLimits.col.scope'),
        type: 'string',
        format: (val) => t(SCOPE_LABEL[val as RateLimitScope] ?? '—'),
      },
      {
        key: 'subject',
        header: t('admin.billing.rateLimits.col.subject'),
        type: 'string',
      },
      {
        key: 'limit',
        header: t('admin.billing.rateLimits.col.limit'),
        type: 'number',
        align: 'right',
        format: (val) => Number(val).toLocaleString('en-US'),
      },
      {
        key: 'window',
        header: t('admin.billing.rateLimits.col.window'),
        type: 'string',
        format: (val) => t(WINDOW_LABEL[val as RateLimitWindow] ?? '—'),
      },
      {
        key: 'current_usage',
        header: t('admin.billing.rateLimits.col.usage'),
        type: 'number',
        align: 'right',
        format: (val, row) => {
          const usage = Number(val);
          const limit = Number(row.limit);
          const tone = toneForUsageRatio(usage, limit);
          const pct =
            limit > 0 ? Math.round((usage / limit) * 100) : null;
          return (
            <span className="inline-flex items-center gap-2">
              <Badge tone={tone}>
                {usage.toLocaleString('en-US')}
                {pct !== null ? ` · ${pct}%` : ''}
              </Badge>
            </span>
          );
        },
      },
      {
        key: 'id',
        header: t('admin.billing.rateLimits.col.actions'),
        type: 'string',
        format: (_val, row) => (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(row as RateLimitRule);
                setDrawerOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3 w-3" /> {t('admin.billing.rateLimits.edit')}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(row.id)}
              className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" /> {t('admin.billing.rateLimits.delete')}
            </button>
          </span>
        ),
      },
    ],
    // CATALOGUE is a stable module-level import; columns only need to
    // be built once for this admin-only view.
    [],
  );

  function openAdd() {
    setEditing(null);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditing(null);
    setDrawerError(null);
  }

  async function handleSubmit(input: RateLimitRuleInput) {
    setSaving(true);
    setDrawerError(null);
    try {
      if (editing) {
        const updated = await updateRateLimitRule(editing.id, input);
        setRules((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      } else {
        const created = await createRateLimitRule(input);
        setRules((prev) => [...prev, created]);
      }
      setDrawerOpen(false);
      setEditing(null);
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRateLimitRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t('admin.billing.rateLimits.heading')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cap API usage per key, agent, or client IP. Counts reset at the
            end of each window.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('admin.billing.rateLimits.add')}
        </button>
      </header>

      {error ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Could not load rate limits.</strong>{' '}
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : (
        <SortableTable
          rows={rules as Row[]}
          columns={columns}
          emptyMessage={t('admin.billing.rateLimits.empty')}
        />
      )}

      <RateLimitRuleDrawer
        open={drawerOpen}
        initial={editing}
        saving={saving}
        errorMessage={drawerError}
        onClose={closeDrawer}
        onSubmit={(input) => void handleSubmit(input)}
        onDelete={(id) => void handleDelete(id)}
        labels={{
          headingAdd: t('admin.billing.rateLimits.add'),
          headingEdit: t('admin.billing.rateLimits.edit'),
          scope: t('admin.billing.rateLimits.col.scope'),
          scopePerKey: t('admin.billing.rateLimits.scope.perKey'),
          scopePerAgent: t('admin.billing.rateLimits.scope.perAgent'),
          scopePerIp: t('admin.billing.rateLimits.scope.perIp'),
          subject: t('admin.billing.rateLimits.col.subject'),
          limit: t('admin.billing.rateLimits.col.limit'),
          window: t('admin.billing.rateLimits.col.window'),
          window1m: t('admin.billing.rateLimits.window.1m'),
          window5m: t('admin.billing.rateLimits.window.5m'),
          window1h: t('admin.billing.rateLimits.window.1h'),
          window1d: t('admin.billing.rateLimits.window.1d'),
          save: t('admin.billing.rateLimits.edit'),
          cancel: 'Cancel',
          delete: t('admin.billing.rateLimits.delete'),
        }}
      />
    </div>
  );
}
