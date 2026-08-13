/**
 * Headless Rendering admin page — Wave 8 §S8.11.
 *
 * Live view of the headless render queue:
 *   - KPI tiles (queued, running, succeeded 1h, failed 1h, avg duration, error rate)
 *   - 24h throughput chart
 *   - Recent renders table with cancel action
 *   - Per-tenant configuration form
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { KpiTile } from '../../components/KpiTile';
import { Badge, type BadgeTone } from '../../components/Badge';
import { ThroughputChart } from '../../components/rendering/ThroughputChart';
import { ConfigForm } from '../../components/rendering/ConfigForm';
import {
  getRenderQueueStatus,
  listRenderSamples,
  getRenderConfig,
  updateRenderConfig,
  cancelRender,
} from '../../lib/rendering-service';
import type {
  RenderConfig,
  RenderJobStatus,
  RenderQueueStatus,
  RenderSample,
} from '../../lib/types';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

function t(id: string): string {
  return CATALOGUE[id] ?? id;
}

function toneForRenderStatus(status: RenderJobStatus): BadgeTone {
  switch (status) {
    case 'succeeded':
      return 'green';
    case 'running':
      return 'brand';
    case 'queued':
      return 'yellow';
    case 'failed':
      return 'red';
    case 'cancelled':
      return 'grey';
    default:
      return 'grey';
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false });
}

export default function RenderingPage() {
  const [status, setStatus] = useState<RenderQueueStatus | null>(null);
  const [samples, setSamples] = useState<RenderSample[]>([]);
  const [config, setConfig] = useState<RenderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queue, list, cfg] = await Promise.all([
        getRenderQueueStatus(),
        listRenderSamples(20),
        getRenderConfig(),
      ]);
      setStatus(queue);
      setSamples(list);
      setConfig(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rendering data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancel = useCallback(async (id: string) => {
    setActionBusy(id);
    try {
      const updated = await cancelRender(id);
      setSamples((prev) =>
        prev.map((s) => (s.id === id ? updated : s)),
      );
    } finally {
      setActionBusy(null);
    }
  }, []);

  const handleSave = useCallback(async (next: RenderConfig) => {
    const updated = await updateRenderConfig(next);
    setConfig(updated);
  }, []);

  return (
    <div data-testid="rendering-page">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">
        <FormattedMessage id="admin.rendering.heading" catalogue={CATALOGUE} />
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        <FormattedMessage
          id="admin.rendering.subheading"
          catalogue={CATALOGUE}
        />
      </p>

      {loading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy
          data-testid="rendering-loading"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-2 h-7 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Could not load rendering data.</strong>{' '}
          {error}
        </div>
      ) : null}

      {status ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="rendering-kpis"
        >
          <KpiTile
            title={t('admin.rendering.kpi.queued')}
            value={String(status.queued)}
            tone={status.queued > 0 ? 'warning' : 'muted'}
          />
          <KpiTile
            title={t('admin.rendering.kpi.running')}
            value={String(status.running)}
            tone={status.running > 0 ? 'brand' : 'muted'}
          />
          <KpiTile
            title={t('admin.rendering.kpi.succeeded1h')}
            value={String(status.succeeded_1h)}
            tone="success"
          />
          <KpiTile
            title={t('admin.rendering.kpi.failed1h')}
            value={String(status.failed_1h)}
            tone={status.failed_1h > 0 ? 'danger' : 'muted'}
          />
          <KpiTile
            title={t('admin.rendering.kpi.avgDuration')}
            value={formatDuration(status.avg_duration_ms_1h)}
            tone="muted"
          />
          <KpiTile
            title={t('admin.rendering.kpi.errorRate')}
            value={`${(status.error_rate_1h * 100).toFixed(1)}%`}
            tone={status.error_rate_1h > 0.05 ? 'warning' : 'muted'}
          />
        </div>
      ) : null}

      {status ? (
        <section
          className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          data-testid="rendering-throughput"
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <FormattedMessage
              id="admin.rendering.throughput.heading"
              catalogue={CATALOGUE}
            />
          </h2>
          <div className="text-slate-700">
            <ThroughputChart points={status.throughput} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-1 w-4 rounded bg-current opacity-80"
              />
              jobs/min
            </span>
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-1 w-4 rounded border-b border-dashed border-current opacity-60"
              />
              errors/min
            </span>
          </div>
        </section>
      ) : null}

      <section
        className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm"
        data-testid="rendering-samples"
      >
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            <FormattedMessage
              id="admin.rendering.samples.heading"
              catalogue={CATALOGUE}
            />
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.id')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.deck')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.status')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.started')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.duration')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.format')}
                </th>
                <th className="px-4 py-2">
                  {t('admin.rendering.col.action')}
                </th>
              </tr>
            </thead>
            <tbody>
              {samples.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-400"
                  >
                    No renders yet.
                  </td>
                </tr>
              ) : (
                samples.map((s) => (
                  <tr
                    key={s.id}
                    data-testid={`rendering-sample-row-${s.id}`}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">
                      {s.id}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {s.deck_id}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={toneForRenderStatus(s.status)}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-600 tabular-nums">
                      {formatTime(s.started_at_ms)}
                    </td>
                    <td className="px-4 py-2 text-slate-600 tabular-nums">
                      {formatDuration(s.duration_ms)}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{s.output_format}</td>
                    <td className="px-4 py-2">
                      {s.status === 'running' || s.status === 'queued' ? (
                        <button
                          data-testid={`rendering-cancel-${s.id}`}
                          type="button"
                          disabled={actionBusy === s.id}
                          onClick={() => handleCancel(s.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {t('admin.rendering.cancel')}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {config ? (
        <section className="mt-6" data-testid="rendering-config-section">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <FormattedMessage
              id="admin.rendering.config.heading"
              catalogue={CATALOGUE}
            />
          </h2>
          <ConfigForm config={config} onSave={handleSave} />
        </section>
      ) : null}
    </div>
  );
}
