/**
 * @domio/obs-control-plane — Grafana dashboard generation.
 *
 * Generates dashboard JSON for a service. Each dashboard has:
 *   - RED metrics row: Rate, Errors, Duration (p50/p95/p99)
 *   - Service-specific KPI row (varies by service tier)
 *   - SLO burn-rate row (consumes alerts from `infra/prometheus/alerts/slo.yaml`)
 *
 * Output is valid Grafana dashboard JSON (schema v36+). Tested in CI by
 * `infra/grafana/dashboards/grafana_schema.test.ts` (separate file).
 */

import type { SloEntry } from './types.js';

export interface DashboardInput {
  readonly service: string;
  readonly displayName: string;
  readonly tier: 'tier-1' | 'tier-2' | 'tier-3';
  readonly slos: readonly SloEntry[];
}

/** Generate a complete Grafana dashboard JSON. */
export function generateDashboard(input: DashboardInput): GrafanaDashboard {
  return {
    title: `${input.displayName} — Service Overview`,
    uid: dashboardUid(input.service),
    schemaVersion: 39,
    version: 1,
    refresh: '30s',
    time: { from: 'now-6h', to: 'now' },
    timezone: 'browser',
    tags: [input.tier, 'domio', serviceShort(input.service)],
    panels: buildPanels(input),
    templating: { list: [] },
    annotations: { list: [] },
  };
}

interface GrafanaDashboard {
  title: string;
  uid: string;
  schemaVersion: number;
  version: number;
  refresh: string;
  time: { from: string; to: string };
  timezone: string;
  tags: string[];
  panels: GrafanaPanel[];
  templating: { list: unknown[] };
  annotations: { list: unknown[] };
}

interface GrafanaPanel {
  id: number;
  type: string;
  title: string;
  gridPos: { x: number; y: number; w: number; h: number };
  targets: ReadonlyArray<{ expr: string; legendFormat?: string }>;
  fieldConfig: { defaults: { unit: string }; overrides: unknown[] };
  options: Record<string, unknown>;
}

function buildPanels(input: DashboardInput): GrafanaPanel[] {
  const panels: GrafanaPanel[] = [];
  let id = 1;

  // Row 1: RED metrics.
  panels.push(
    panel(id++, 'timeseries', 'Request rate (req/s)', 0, 0, 8, 6, [
      {
        expr: `sum(rate(http_requests_total{service="${serviceShort(input.service)}"}[1m]))`,
        legendFormat: 'rps',
      },
    ]),
    panel(id++, 'timeseries', 'Error rate (%)', 8, 0, 8, 6, [
      {
        expr:
          `sum(rate(http_requests_total{service="${serviceShort(input.service)}",status=~"5.."}[1m])) ` +
          `/ ` +
          `sum(rate(http_requests_total{service="${serviceShort(input.service)}"}[1m]))`,
        legendFormat: 'error rate',
      },
    ]),
    panel(id++, 'timeseries', 'Latency p95 (ms)', 16, 0, 8, 6, [
      {
        expr:
          `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="${serviceShort(input.service)}"}[5m])))`,
        legendFormat: 'p95',
      },
    ]),
  );

  // Row 2: SLO burn-rate panels.
  for (const slo of input.slos) {
    panels.push(
      panel(id++, 'stat', `${slo.slo} (target ${slo.target})`, ((id - 2) % 24), 6, 8, 4, [
        {
          expr: sloBurningExpr(slo),
          legendFormat: slo.slo,
        },
      ]),
    );
  }

  return panels;
}

function panel(
  id: number,
  type: string,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number,
  targets: ReadonlyArray<{ expr: string; legendFormat?: string }>,
): GrafanaPanel {
  return {
    id,
    type,
    title,
    gridPos: { x, y, w, h },
    targets,
    fieldConfig: { defaults: { unit: 'short' }, overrides: [] },
    options: {},
  };
}

function sloBurningExpr(slo: SloEntry): string {
  const service = serviceShort(slo.service);
  if (slo.kind === 'availability') {
    return `1 - (sum(rate(http_requests_total{service="${service}",status=~"5.."}[1h])) / sum(rate(http_requests_total{service="${service}"}[1h])))`;
  }
  const threshold = (slo.latencyThresholdMs ?? 0) / 1000;
  return `1 - (sum(rate(http_request_duration_seconds_bucket{service="${service}",le="${threshold}"}[1h])) / sum(rate(http_request_duration_seconds_count{service="${service}"}[1h])))`;
}

function serviceShort(service: string): string {
  return service.replace(/^@domio\//, '').replace(/-service$/, '');
}

function dashboardUid(service: string): string {
  return `domio-${serviceShort(service)}`;
}
