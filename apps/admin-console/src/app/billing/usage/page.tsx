'use client';

/**
 * Usage & spend dashboard — Wave 10 §S10.6.
 *
 * Surfaces:
 *  - 4 KPI tiles (API calls, AI tokens, render minutes, export minutes)
 *  - 7/30/90-day area chart of the selected metric
 *  - Sortable per-agent breakdown
 *  - Projected monthly cost panel
 *
 * All read-side data comes from `billing-service`, which falls back to
 * deterministic seed data if the backend is unreachable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import enMessages from '../../../../messages/en.json';
import { KpiTile } from '../../../components/KpiTile';
import { UsageChart } from '../../../components/billing/UsageChart';
import { AgentUsageTable, type AgentUsageRow } from '../../../components/billing/AgentUsageTable';
import {
  formatCents,
  formatCompact,
  getUsageSeries,
  getUsageSummary,
  listAgentUsage,
  projectMonthlyCost,
  type AgentUsage,
  type UsageMetric,
  type UsageSeries,
  type UsageSummary,
} from '../../../lib/billing-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function t(id: string): string {
  return CATALOGUE[id] ?? id;
}

const RANGE_OPTIONS: ReadonlyArray<{ days: number; labelKey: string }> = [
  { days: 7, labelKey: 'admin.billing.usage.chart.range.7d' },
  { days: 30, labelKey: 'admin.billing.usage.chart.range.30d' },
  { days: 90, labelKey: 'admin.billing.usage.chart.range.90d' },
];

const METRIC_OPTIONS: ReadonlyArray<{
  metric: UsageMetric;
  labelKey: string;
  tileKey: string;
}> = [
  {
    metric: 'api_calls',
    labelKey: 'admin.billing.usage.apiCalls',
    tileKey: 'admin.billing.usage.apiCalls',
  },
  {
    metric: 'ai_tokens',
    labelKey: 'admin.billing.usage.aiTokens',
    tileKey: 'admin.billing.usage.aiTokens',
  },
  {
    metric: 'render_minutes',
    labelKey: 'admin.billing.usage.renderMinutes',
    tileKey: 'admin.billing.usage.renderMinutes',
  },
  {
    metric: 'export_minutes',
    labelKey: 'admin.billing.usage.exportMinutes',
    tileKey: 'admin.billing.usage.exportMinutes',
  },
];

function formatSummaryValue(metric: UsageMetric, summary: UsageSummary): string {
  switch (metric) {
    case 'api_calls':
      return formatCompact(summary.api_calls);
    case 'ai_tokens':
      return formatCompact(summary.ai_tokens);
    case 'render_minutes':
      return `${summary.render_minutes.toLocaleString('en-US')} min`;
    case 'export_minutes':
      return `${summary.export_minutes.toLocaleString('en-US')} min`;
  }
}

export default function UsageDashboardPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [agents, setAgents] = useState<AgentUsage[]>([]);
  const [activeMetric, setActiveMetric] = useState<UsageMetric>('api_calls');
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [series, setSeries] = useState<UsageSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummaryAndAgents = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([getUsageSummary(), listAgentUsage()]);
      setSummary(s);
      setAgents(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage');
    }
  }, []);

  const loadSeries = useCallback(
    async (metric: UsageMetric, days: number) => {
      try {
        const s = await getUsageSeries(metric, days);
        setSeries(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load series');
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    void loadSummaryAndAgents().finally(() => setLoading(false));
  }, [loadSummaryAndAgents]);

  useEffect(() => {
    void loadSeries(activeMetric, rangeDays);
  }, [activeMetric, rangeDays, loadSeries]);

  const projection = useMemo(() => {
    if (!summary) return null;
    return projectMonthlyCost(30, summary);
  }, [summary]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('admin.billing.usage.heading')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {summary
            ? `${t('admin.billing.usage.cost')}: ${formatCents(summary.cost_cents)} · ${new Date(summary.period_start_ms).toLocaleDateString('en-US')} – ${new Date(summary.period_end_ms).toLocaleDateString('en-US')}`
            : 'Loading summary…'}
        </p>
      </header>

      {error ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Could not load usage data.</strong>{' '}
          {error}
        </div>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Usage KPIs"
      >
        {METRIC_OPTIONS.map((m) => (
          <KpiTile
            key={m.metric}
            title={t(m.tileKey)}
            value={
              summary
                ? formatSummaryValue(m.metric, summary)
                : t('admin.billing.usage.chart.empty')
            }
            tone={activeMetric === m.metric ? 'brand' : 'muted'}
          />
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('admin.billing.usage.heading')}
            </span>
            <div className="ml-2 inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
              {METRIC_OPTIONS.map((m) => (
                <button
                  key={m.metric}
                  type="button"
                  onClick={() => setActiveMetric(m.metric)}
                  className={
                    activeMetric === m.metric
                      ? 'rounded px-2 py-1 font-semibold text-brand-700'
                      : 'rounded px-2 py-1 text-slate-600 hover:text-slate-900'
                  }
                  aria-pressed={activeMetric === m.metric}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRangeDays(r.days)}
                className={
                  rangeDays === r.days
                    ? 'rounded px-2 py-1 font-semibold text-brand-700'
                    : 'rounded px-2 py-1 text-slate-600 hover:text-slate-900'
                }
                aria-pressed={rangeDays === r.days}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {series && series.series.length > 0 ? (
            <UsageChart
              metric={series.metric}
              series={series.series}
              width={720}
              height={220}
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
              {t('admin.billing.usage.chart.empty')}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.billing.usage.agents.heading')}
          </h2>
        </header>
        <AgentUsageTable
          rows={agents as AgentUsageRow[]}
          emptyMessage="No agent usage yet."
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('admin.billing.usage.projection.heading')}
        </h2>
        {projection ? (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <div>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCents(projection.monthly_cost_cents)}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {t('admin.billing.usage.projection.body').replace(
                  '${amount}',
                  formatCents(projection.monthly_cost_cents),
                )}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Based on {projection.days_observed} days of observed usage.
              </p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {METRIC_OPTIONS.map((m) => {
                const cents = projection.per_metric_cents[m.metric];
                return (
                  <li
                    key={m.metric}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5"
                  >
                    <span className="text-slate-600">{t(m.labelKey)}</span>
                    <span className="tabular-nums text-slate-900">
                      {formatCents(cents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Loading projection…</p>
        )}
      </section>

      {loading ? (
        <p className="text-xs text-slate-400" aria-live="polite">
          Loading…
        </p>
      ) : null}
    </div>
  );
}
