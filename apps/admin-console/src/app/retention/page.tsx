/**
 * Retention Policies page — Wave 8 §S8.6.
 *
 * Per-content-type retention period editor with preview of affected
 * decks. Items under active legal holds are exempt (counted separately
 * in each policy's `exemptions` field).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { Badge } from '../../components/Badge';
import {
  listRetentionPolicies,
  previewRetention,
  upsertRetentionPolicy,
  RETENTION_CONTENT_TYPE_LABELS,
  RETENTION_PERIOD_LABELS,
} from '../../lib/retention-service';
import type {
  RetentionPeriod,
  RetentionPolicy,
  RetentionPreview,
} from '../../lib/types';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

const PERIODS: ReadonlyArray<RetentionPeriod> = [
  '30d',
  '90d',
  '1y',
  '3y',
  '7y',
  'indefinite',
];

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RetentionPage() {
  const [policies, setPolicies] = useState<ReadonlyArray<RetentionPolicy>>([]);
  const [edits, setEdits] = useState<Readonly<Record<string, RetentionPeriod>>>({});
  const [previewById, setPreviewById] = useState<Readonly<Record<string, RetentionPreview>>>({});
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listRetentionPolicies();
      setPolicies(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retention policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => Object.keys(edits).length > 0, [edits]);

  async function onPreview(id: string) {
    setError(null);
    try {
      const preview = await previewRetention(id);
      setPreviewById((prev) => ({ ...prev, [id]: preview }));
      setOpenPreviewId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preview');
    }
  }

  async function onSave(id: string) {
    const period = edits[id];
    if (!period) return;
    const policy = policies.find((p) => p.id === id);
    if (!policy) return;
    setSavingId(id);
    setError(null);
    try {
      const next = await upsertRetentionPolicy({
        content_type: policy.content_type,
        period,
      });
      setPolicies((prev) => prev.map((p) => (p.id === id ? next : p)));
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save policy');
    } finally {
      setSavingId(null);
    }
  }

  function setPeriod(id: string, period: RetentionPeriod) {
    setEdits((prev) => ({ ...prev, [id]: period }));
  }

  const openPreview = openPreviewId ? previewById[openPreviewId] : undefined;

  return (
    <div data-testid="retention-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.retention.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          <FormattedMessage id="admin.retention.subheading" catalogue={CATALOGUE} />
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {loading && policies.length === 0 ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : (
        <div
          data-testid="retention-table"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">
                  <FormattedMessage id="admin.retention.col.type" catalogue={CATALOGUE} />
                </th>
                <th className="px-4 py-2">
                  <FormattedMessage id="admin.retention.col.period" catalogue={CATALOGUE} />
                </th>
                <th className="px-4 py-2">
                  <FormattedMessage id="admin.retention.col.exemptions" catalogue={CATALOGUE} />
                </th>
                <th className="px-4 py-2">
                  <FormattedMessage id="admin.retention.col.updated" catalogue={CATALOGUE} />
                </th>
                <th className="px-4 py-2 text-right">
                  <FormattedMessage id="admin.retention.col.actions" catalogue={CATALOGUE} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((p) => {
                const draft = edits[p.id];
                const current = draft ?? p.period;
                const changed = draft !== undefined && draft !== p.period;
                return (
                  <tr
                    key={p.id}
                    data-testid={`retention-row-${p.id}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {RETENTION_CONTENT_TYPE_LABELS[p.content_type]}
                      </div>
                      <div className="text-xs text-slate-500">{p.content_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        data-testid={`retention-period-${p.id}`}
                        value={current}
                        onChange={(e) => setPeriod(p.id, e.target.value as RetentionPeriod)}
                        className={
                          'rounded-md border px-2 py-1 text-sm transition focus:outline-none focus:ring-1 ' +
                          (changed
                            ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500'
                            : 'border-slate-300 bg-white focus:border-brand-500 focus:ring-brand-500')
                        }
                      >
                        {PERIODS.map((opt) => (
                          <option key={opt} value={opt}>
                            {RETENTION_PERIOD_LABELS[opt]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {p.exemptions > 0 ? (
                        <Badge tone="amber">{p.exemptions}</Badge>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>{formatDate(p.updated_at_ms)}</div>
                      <div>by {p.updated_by}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          data-testid={`retention-preview-${p.id}`}
                          onClick={() => onPreview(p.id)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          data-testid={`retention-save-${p.id}`}
                          disabled={!changed || savingId === p.id}
                          onClick={() => onSave(p.id)}
                          className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                        >
                          {savingId === p.id
                            ? '…'
                            : dirty
                              ? 'Save'
                              : 'Saved'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openPreview && openPreviewId && (
        <div
          data-testid="retention-preview-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setOpenPreviewId(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                <FormattedMessage
                  id="admin.retention.preview.heading"
                  catalogue={CATALOGUE}
                />
              </h2>
              <button
                type="button"
                onClick={() => setOpenPreviewId(null)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 text-sm">
              {openPreview.total_affected === 0 ? (
                <p className="text-slate-500">No items fall due under this policy.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {openPreview.affected_decks.map((d) => (
                    <li
                      key={d.id}
                      data-testid={`retention-preview-row-${d.id}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{d.title}</div>
                        <div className="text-xs text-slate-500">
                          <code>{d.id}</code> · last modified{' '}
                          {formatDate(d.last_modified_ms)}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge tone={d.days_until_purge < 7 ? 'red' : 'amber'}>
                          <FormattedMessage
                            id="admin.retention.preview.daysLeft"
                            catalogue={CATALOGUE}
                            values={{ days: d.days_until_purge }}
                          />
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span>
                Total affected:{' '}
                <span className="font-semibold text-slate-900">
                  {openPreview.total_affected}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpenPreviewId(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}