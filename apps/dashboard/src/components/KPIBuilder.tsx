'use client';

import { useCallback, useState } from 'react';
import { clsx } from 'clsx';
import {
  KPI_METRICS,
  saveKpi,
  type KpiAggregation,
  type KpiDefinition,
  type KpiMetric,
} from '../lib/cohort-service';

export const KPI_AGGREGATIONS: ReadonlyArray<KpiAggregation> = [
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'median',
];

export interface KPIBuilderProps {
  workspaceId: string;
  initial?: ReadonlyArray<KpiDefinition>;
  baseUrl?: string;
  onSave?: (kpi: KpiDefinition) => void;
}

/**
 * Tiny form that lets a workspace pick a metric family, an
 * aggregation, an optional title, and POST the result to
 * `/v1/analytics/kpis`. On success the new tile appears in the
 * supplied `initial` list (optimistic append driven by `onSave`).
 *
 * The builder is intentionally uncontrolled — the parent owns the
 * list of saved tiles so the overview page can pick it up.
 */
export function KPIBuilder({ workspaceId, initial = [], baseUrl, onSave }: KPIBuilderProps) {
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<KpiMetric>(KPI_METRICS[0]);
  const [aggregation, setAggregation] = useState<KpiAggregation>('avg');
  const [deckId, setDeckId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReadonlyArray<KpiDefinition>>(initial);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const kpi = await saveKpi(
          workspaceId,
          {
            title: title.trim() || `${aggregation}_${metric}`,
            metric,
            aggregation,
            ...(deckId ? { deckId } : {}),
          },
          baseUrl ? { baseUrl } : {},
        );
        setSaved((prev) => [...prev, kpi]);
        setTitle('');
        setDeckId('');
        onSave?.(kpi);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSubmitting(false);
      }
    },
    [aggregation, baseUrl, deckId, metric, onSave, submitting, title, workspaceId],
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        data-testid="kpi-builder"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hero banner CTR"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="kpi-title"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Metric
            </span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as KpiMetric)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="kpi-metric"
            >
              {KPI_METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Aggregation
            </span>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as KpiAggregation)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="kpi-aggregation"
            >
              {KPI_AGGREGATIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Deck ID (optional)
            </span>
            <input
              type="text"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              placeholder="deck-123"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="kpi-deck"
            />
          </label>
        </div>
        {error ? (
          <div
            role="alert"
            className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
            data-testid="kpi-error"
          >
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={submitting}
            className={clsx(
              'rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700',
              submitting && 'opacity-50',
            )}
            data-testid="kpi-save"
          >
            {submitting ? 'Saving…' : 'Save tile'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="kpi-tiles">
        {saved.length === 0 ? (
          <div
            className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
            data-testid="kpi-empty"
          >
            No custom tiles yet — fill the form above to add one.
          </div>
        ) : (
          saved.map((kpi) => (
            <div
              key={kpi.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              data-testid="kpi-tile"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {kpi.title}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : '—'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {kpi.aggregation} of {kpi.metric}
                {kpi.deckId ? ` · deck ${kpi.deckId}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
