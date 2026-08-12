'use client';

import { KpiTile } from '../../components/KpiTile';
import { Sparkline } from '../../components/Sparkline';
import type { OverviewKpis } from '../../lib/analytics-service';

export type { OverviewKpis };

const DEFAULT_KPIS: OverviewKpis = {
  sessions: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  viewers: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  avgDwellMs: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  completionRate: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

/**
 * Client wrapper that renders 4 KPI tiles + sparklines. Server
 * component (`/overview/page.tsx`) hydrates this with fetched data.
 */
export function OverviewClient({ kpis }: { kpis?: OverviewKpis }) {
  const data = kpis ?? DEFAULT_KPIS;
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        title="Sessions"
        value={formatNumber(data.sessions.value)}
        delta={data.sessions.delta}
        sparkline={<Sparkline values={data.sessions.series} />}
      />
      <KpiTile
        title="Viewers"
        value={formatNumber(data.viewers.value)}
        delta={data.viewers.delta}
        sparkline={<Sparkline values={data.viewers.series} />}
      />
      <KpiTile
        title="Avg dwell"
        value={formatMs(data.avgDwellMs.value)}
        delta={data.avgDwellMs.delta}
        sparkline={<Sparkline values={data.avgDwellMs.series} />}
      />
      <KpiTile
        title="Completion"
        value={formatPct(data.completionRate.value)}
        delta={data.completionRate.delta}
        sparkline={<Sparkline values={data.completionRate.series} />}
      />
    </section>
  );
}