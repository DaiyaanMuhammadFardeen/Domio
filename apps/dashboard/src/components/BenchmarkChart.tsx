'use client';

import { useEffect, useState } from 'react';
import { listPeerBenchmarks, type PeerBenchmark } from '../lib/benchmark-service';

export interface BenchmarkChartProps {
  workspaceId: string;
  initial?: ReadonlyArray<PeerBenchmark>;
  metricLabel?: string;
}

function formatValue(value: number, isRate: boolean): string {
  if (isRate) return `${(value * 100).toFixed(1)}%`;
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  return value.toFixed(1);
}

function isRateMetric(metric: string | undefined): boolean {
  if (!metric) return true;
  return metric.includes('rate') || metric.includes('completion');
}

interface BarProps {
  label: string;
  value: number;
  peerP25: number;
  peerMedian: number;
  peerP75: number;
  percentile: number;
  isRate: boolean;
}

/**
 * Single peer-comparison row. The bar shows the workspace's value
 * against a stacked backdrop of p25→median→p75 from the peer cohort,
 * with the percentile + a plain-English suggestion.
 */
function PeerBar({ label, value, peerP25, peerMedian, peerP75, percentile, isRate }: BarProps) {
  const max = Math.max(peerP75, value, 0.0001) * 1.1;
  const valuePct = Math.max(0, Math.min(100, (value / max) * 100));
  const p25Pct = Math.max(0, Math.min(100, (peerP25 / max) * 100));
  const medianPct = Math.max(0, Math.min(100, (peerMedian / max) * 100));
  const p75Pct = Math.max(0, Math.min(100, (peerP75 / max) * 100));

  return (
    <div className="space-y-1" data-testid="benchmark-bar">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="tabular-nums text-slate-500">
          {formatValue(value, isRate)} · p{percentile.toFixed(0)}
        </span>
      </div>
      <div className="relative h-6 rounded bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 bg-slate-200"
          style={{ width: `${p25Pct}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 left-0 bg-slate-300"
          style={{ width: `${medianPct}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 left-0 bg-slate-400"
          style={{ width: `${p75Pct}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 left-0 rounded bg-brand-600"
          style={{ width: `${valuePct}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-900"
          style={{ left: `${p75Pct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>p25 {formatValue(peerP25, isRate)}</span>
        <span>median {formatValue(peerMedian, isRate)}</span>
        <span>p75 {formatValue(peerP75, isRate)}</span>
      </div>
    </div>
  );
}

/**
 * BenchmarkChart — workspace vs peer comparison.
 *
 * Renders one horizontal bar per segment (industry, audience size,
 * deck size). Each bar shows the workspace's value as a brand
 * overlay on top of the peer distribution backdrop. The percentile
 * + plain-English suggestion are surfaced underneath.
 */
export function BenchmarkChart({
  workspaceId,
  initial,
  metricLabel = 'Completion rate',
}: BenchmarkChartProps) {
  const [rows, setRows] = useState<ReadonlyArray<PeerBenchmark>>(initial ?? []);
  const isRate = isRateMetric(metricLabel);

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    async function load() {
      const list = await listPeerBenchmarks(workspaceId);
      if (!cancelled) setRows(list);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, initial]);

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
        role="status"
        data-testid="benchmark-empty"
      >
        No peer benchmarks yet. Once the benchmark service publishes your segment, comparison will
        appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="benchmark-chart">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {metricLabel} vs peers
        </h2>
        <span className="text-xs text-slate-500">{rows.length} segments</span>
      </header>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.segment} className="rounded-xl border border-slate-200 bg-white p-4">
            <PeerBar
              label={row.segment}
              value={row.workspaceValue}
              peerP25={row.peerP25}
              peerMedian={row.peerMedian}
              peerP75={row.peerP75}
              percentile={row.percentile}
              isRate={isRate}
            />
            <p className="mt-2 text-xs text-slate-500" data-testid="benchmark-suggestion">
              {row.suggestion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
