/**
 * Brand governance dashboard — Wave 8 §S8.2.
 *
 * Replaces the previous brand-lock curation surface with the
 * enterprise brand-governance view: org-wide on-brand score,
 * 30-day trend, violation report, CSV bulk import, and per-deck
 * enforcement status.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { KpiTile } from '../../components/KpiTile';
import { Badge } from '../../components/Badge';
import { ScoreTrendChart } from '../../components/brand/ScoreTrendChart';
import { ViolationTable } from '../../components/brand/ViolationTable';
import { CSVImport } from '../../components/brand/CSVImport';
import {
  getBrandGovernanceSnapshot,
  importBrandLocksCSV,
  setBrandLockEnforcement,
  type BrandGovernanceSnapshot,
  type BrandLockEnforcement,
  type BrandViolation,
} from '../../lib/brand-governance-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

interface PreviewState {
  readonly file: File;
  readonly rows: ReadonlyArray<string>;
}

export default function BrandGovernancePage() {
  const [snapshot, setSnapshot] = useState<BrandGovernanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(
    null,
  );
  const [enforcementFilter, setEnforcementFilter] = useState<'all' | BrandLockEnforcement>('all');
  const [enforcementState, setEnforcementState] = useState<
    ReadonlyMap<string, BrandLockEnforcement>
  >(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getBrandGovernanceSnapshot();
      setSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load brand governance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredViolations: ReadonlyArray<BrandViolation> = useMemo(() => {
    if (!snapshot) return [];
    if (enforcementFilter === 'all') return snapshot.violations;
    return snapshot.violations.filter((v) => {
      const mode = enforcementState.get(v.deck_id) ?? 'warning';
      return mode === enforcementFilter;
    });
  }, [snapshot, enforcementFilter, enforcementState]);

  const orgScoreDelta = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.orgScore - snapshot.previousScore;
  }, [snapshot]);

  async function onImportFile(file: File) {
    setImportResult(null);
    setError(null);
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .slice(0, 50);
    setPreview({ file, rows });
  }

  async function onSubmitImport() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await importBrandLocksCSV(preview.file);
      setImportResult({ imported: result.imported, skipped: result.skipped });
      setPreview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV import failed');
    } finally {
      setSubmitting(false);
    }
  }

  function onChangeEnforcement(deckId: string, mode: BrandLockEnforcement) {
    void setBrandLockEnforcement(deckId, mode);
    setEnforcementState((prev) => {
      const next = new Map(prev);
      next.set(deckId, mode);
      return next;
    });
  }

  return (
    <div data-testid="brand-governance-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.brandGovernance.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <FormattedMessage id="admin.brandGovernance.subheading" catalogue={CATALOGUE} />
        </p>
      </div>

      {loading && !snapshot && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {importResult && (
        <div
          data-testid="brand-csv-toast"
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <FormattedMessage
            id="admin.brandGovernance.csvImport.success"
            catalogue={CATALOGUE}
            values={{ n: importResult.imported, s: importResult.skipped }}
          />
        </div>
      )}

      {snapshot && (
        <>
          <section
            data-testid="brand-score-trend"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <KpiTile
              title="Org On-Brand Score"
              value={`${snapshot.orgScore}`}
              delta={orgScoreDelta}
              tone={orgScoreDelta >= 0 ? 'success' : 'warning'}
            />
            <KpiTile
              title="Decks Enforced"
              value={`${snapshot.decksEnforced}`}
              delta={0}
              tone="brand"
            />
            <KpiTile
              title="Open Violations"
              value={`${snapshot.violations.length}`}
              delta={snapshot.violations.length - 8}
              tone={snapshot.violations.length > 8 ? 'warning' : 'success'}
            />
          </section>

          <section
            data-testid="brand-trend-card"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                30-day on-brand score
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {snapshot.previousScore} → {snapshot.orgScore}
              </span>
            </div>
            <div className="text-slate-700">
              <ScoreTrendChart points={snapshot.trend} width={640} height={120} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Brand violations
                </h2>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Enforcement</span>
                  <select
                    data-testid="brand-enforcement-filter"
                    value={enforcementFilter}
                    onChange={(e) =>
                      setEnforcementFilter(e.target.value as 'all' | BrandLockEnforcement)
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="all">All</option>
                    <option value="enforced">Enforced</option>
                    <option value="warning">Warning</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              </div>
              <ViolationTable rows={filteredViolations} />
            </div>

            <div className="space-y-4">
              <CSVImport onImport={onImportFile} />

              {preview && (
                <div
                  data-testid="brand-csv-preview"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Preview ({preview.rows.length} rows)
                  </div>
                  <pre className="overflow-x-auto rounded bg-white p-2 text-xs text-amber-900">
                    {preview.rows.join('\n')}
                  </pre>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      data-testid="brand-csv-submit"
                      onClick={onSubmitImport}
                      disabled={submitting}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {submitting ? 'Importing…' : 'Import'}
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Per-deck enforcement
                </div>
                <ul className="space-y-1">
                  {snapshot.violations.slice(0, 6).map((v) => {
                    const mode = enforcementState.get(v.deck_id) ?? 'warning';
                    return (
                      <li
                        key={v.id}
                        data-testid={`brand-deck-${v.deck_id}`}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-700">{v.deck_title}</div>
                          <div className="truncate text-slate-500">{v.deck_id}</div>
                        </div>
                        <select
                          data-testid={`brand-deck-mode-${v.deck_id}`}
                          value={mode}
                          onChange={(e) =>
                            onChangeEnforcement(v.deck_id, e.target.value as BrandLockEnforcement)
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="enforced">enforced</option>
                          <option value="warning">warning</option>
                          <option value="off">off</option>
                        </select>
                        <Badge
                          tone={
                            mode === 'enforced' ? 'green' : mode === 'warning' ? 'amber' : 'red'
                          }
                        >
                          {mode}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
