/**
 * Legal Hold page — Wave 8 §S8.6.
 *
 * Lists active and released legal holds, supports applying new holds,
 * and releases active holds with mandatory notes.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { Badge } from '../../components/Badge';
import {
  applyLegalHold,
  getAffectedItems,
  listLegalHolds,
  releaseLegalHold,
  LegalHoldError,
} from '../../lib/legal-hold-service';
import type { LegalHold, LegalHoldStatus, LegalHoldTargetKind } from '../../lib/types';

type AffectedItem = { kind: 'deck' | 'asset'; id: string; label: string };

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

type StatusFilter = LegalHoldStatus | 'all';

interface ApplyFormState {
  readonly target_kind: LegalHoldTargetKind;
  readonly target_id: string;
  readonly reason: string;
}

const EMPTY_FORM: ApplyFormState = {
  target_kind: 'deck',
  target_id: '',
  reason: '',
};

export default function LegalHoldPage() {
  const [holds, setHolds] = useState<ReadonlyArray<LegalHold>>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [form, setForm] = useState<ApplyFormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [releaseNotesById, setReleaseNotesById] = useState<Readonly<Record<string, string>>>({});
  const [confirmingReleaseId, setConfirmingReleaseId] = useState<string | null>(null);
  const [affectedById, setAffectedById] = useState<Readonly<Record<string, ReadonlyArray<AffectedItem>>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLegalHolds();
      setHolds(list);
      // Lazy-load affected items for every hold we don't have cached.
      const next: Record<string, ReadonlyArray<AffectedItem>> = {};
      for (const h of list) {
        if (!affectedById[h.id]) {
          next[h.id] = await getAffectedItems(h.id);
        }
      }
      if (Object.keys(next).length > 0) {
        setAffectedById((prev) => ({ ...prev, ...next }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load holds');
    } finally {
      setLoading(false);
    }
  }, [affectedById]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return holds;
    return holds.filter((h) => h.status === filter);
  }, [holds, filter]);

  async function onApply() {
    setError(null);
    if (form.reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.');
      return;
    }
    if (form.target_id.trim().length === 0) {
      setError('Target ID is required.');
      return;
    }
    try {
      await applyLegalHold(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply hold');
    }
  }

  async function onRelease(id: string) {
    setError(null);
    const notes = (releaseNotesById[id] ?? '').trim();
    if (notes.length < 5) {
      setError('Release notes must be at least 5 characters.');
      return;
    }
    try {
      await releaseLegalHold(id, notes);
      setReleaseNotesById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConfirmingReleaseId(null);
      await load();
    } catch (e) {
      if (e instanceof LegalHoldError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to release hold');
      }
    }
  }

  return (
    <div data-testid="legal-hold-page" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.legalHold.heading" catalogue={CATALOGUE} />
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            <FormattedMessage id="admin.legalHold.subheading" catalogue={CATALOGUE} />
          </p>
        </div>
        <button
          type="button"
          data-testid="legal-hold-apply"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <FormattedMessage id="admin.legalHold.apply" catalogue={CATALOGUE} />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {showForm && (
        <section
          data-testid="legal-hold-form"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <FormattedMessage id="admin.legalHold.apply" catalogue={CATALOGUE} />
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                <FormattedMessage id="admin.legalHold.form.targetKind" catalogue={CATALOGUE} />
              </span>
              <select
                data-testid="legal-hold-form-target"
                value={form.target_kind}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    target_kind: e.target.value as LegalHoldTargetKind,
                  }))
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="deck">deck</option>
                <option value="workspace">workspace</option>
                <option value="user">user</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                <FormattedMessage id="admin.legalHold.form.targetId" catalogue={CATALOGUE} />
              </span>
              <input
                type="text"
                value={form.target_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, target_id: e.target.value }))
                }
                placeholder="e.g. deck-prospectus-q3"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="block text-sm md:col-span-3">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                <FormattedMessage id="admin.legalHold.form.reason" catalogue={CATALOGUE} />
              </span>
              <input
                type="text"
                data-testid="legal-hold-form-reason"
                value={form.reason}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="Describe the legal or compliance basis for this hold"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="legal-hold-form-submit"
              onClick={onApply}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <FormattedMessage id="admin.legalHold.form.submit" catalogue={CATALOGUE} />
            </button>
          </div>
        </section>
      )}

      <section className="flex items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold uppercase tracking-wide">Filter</span>
        {(['all', 'active', 'released'] as ReadonlyArray<StatusFilter>).map(
          (option) => (
            <button
              key={option}
              type="button"
              data-testid={`legal-hold-filter-${option}`}
              onClick={() => setFilter(option)}
              className={
                'rounded-full px-3 py-1 text-xs font-medium transition ' +
                (filter === option
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
              }
            >
              {option}
            </button>
          ),
        )}
      </section>

      <section
        data-testid="legal-hold-list"
        className="space-y-3"
      >
        {loading && holds.length === 0 ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            <FormattedMessage id="admin.legalHold.empty" catalogue={CATALOGUE} />
          </div>
        ) : (
          filtered.map((h) => {
            const affected = affectedById[h.id] ?? [];
            const isActive = h.status === 'active';
            const confirming = confirmingReleaseId === h.id;
            return (
              <article
                key={h.id}
                data-testid={`legal-hold-row-${h.id}`}
                className={
                  'rounded-xl border p-4 shadow-sm ' +
                  (isActive
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-200 bg-slate-50 opacity-70')
                }
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {h.target_label}
                      </span>
                      <Badge tone={isActive ? 'green' : 'grey'}>
                        <FormattedMessage
                          id={`admin.legalHold.status.${h.status}`}
                          catalogue={CATALOGUE}
                        />
                      </Badge>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {h.target_kind}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{h.target_id}</code>
                      <span className="mx-2">·</span>
                      Applied {new Date(h.applied_at_ms).toLocaleDateString()} by{' '}
                      {h.applied_by}
                    </div>
                  </div>
                  {isActive && (
                    <button
                      type="button"
                      data-testid={`legal-hold-release-${h.id}`}
                      onClick={() => setConfirmingReleaseId(h.id)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <FormattedMessage id="admin.legalHold.release" catalogue={CATALOGUE} />
                    </button>
                  )}
                </header>
                <p className="mt-2 text-sm text-slate-700">{h.reason}</p>
                {affected.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {affected.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                          {item.kind}
                        </span>
                        <span className="font-medium text-slate-700">{item.label}</span>
                        <code className="text-[10px] text-slate-500">{item.id}</code>
                      </li>
                    ))}
                  </ul>
                )}
                {!isActive && h.released_at_ms && (
                  <div className="mt-3 rounded-md bg-slate-100 p-2 text-xs text-slate-600">
                    Released {new Date(h.released_at_ms).toLocaleDateString()} by{' '}
                    {h.released_by}:{' '}
                    <span className="text-slate-700">{h.release_notes}</span>
                  </div>
                )}
                {confirming && (
                  <div
                    data-testid={`legal-hold-release-confirm-${h.id}`}
                    className="mt-3 space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3"
                  >
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-rose-700">
                        <FormattedMessage
                          id="admin.legalHold.releaseNotes"
                          catalogue={CATALOGUE}
                        />
                      </span>
                      <textarea
                        data-testid={`legal-hold-release-notes-${h.id}`}
                        rows={2}
                        value={releaseNotesById[h.id] ?? ''}
                        onChange={(e) =>
                          setReleaseNotesById((prev) => ({
                            ...prev,
                            [h.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-rose-300 bg-white px-2 py-1.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingReleaseId(null);
                          setReleaseNotesById((prev) => {
                            const next = { ...prev };
                            delete next[h.id];
                            return next;
                          });
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid={`legal-hold-release-confirm-btn-${h.id}`}
                        onClick={() => onRelease(h.id)}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Confirm release
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}