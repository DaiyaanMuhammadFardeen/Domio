'use client';

import { useEffect, useState } from 'react';
import { fetchElementTimeSeries, type ElementTimeSeriesPoint } from '../lib/element-heatmap-service';

export interface ElementTimeSeriesProps {
  workspaceId: string;
  elementId: string;
  elementLabel?: string;
  baseUrl?: string;
}

/**
 * Drill-in time-series chart for a single element. Fetches
 * `/v1/analytics/heatmap/elements/timeseries` whenever the
 * `elementId` changes and renders a sparkline-style polyline so
 * we don't pull in a heavyweight charting dependency for a tiny
 * drill-in widget.
 */
export function ElementTimeSeries({
  workspaceId,
  elementId,
  elementLabel,
  baseUrl,
}: ElementTimeSeriesProps) {
  const [points, setPoints] = useState<ReadonlyArray<ElementTimeSeriesPoint>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchElementTimeSeries(workspaceId, elementId, baseUrl ? { baseUrl } : {})
      .then((rows) => {
        if (cancelled) return;
        setPoints(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Time-series fetch failed');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, elementId, baseUrl]);

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="drill-in"
      data-element-id={elementId}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {elementLabel ?? 'Element'} · time series
        </h3>
        <span className="text-xs text-slate-500">{points.length} points</span>
      </header>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500" data-testid="drill-in-loading">
          Loading…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
          data-testid="drill-in-error"
        >
          {error}
        </div>
      ) : points.length === 0 ? (
        <div
          className="flex h-32 items-center justify-center text-sm text-slate-500"
          data-testid="drill-in-empty-points"
        >
          No time-series points — extend the date window.
        </div>
      ) : (
        <TimeSeriesChart points={points} />
      )}
    </section>
  );
}

/** Tiny inline SVG polyline + dots; deterministic, zero deps. */
function TimeSeriesChart({ points }: { points: ReadonlyArray<ElementTimeSeriesPoint> }) {
  const W = 640;
  const H = 160;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...points.map((p) => p.attention), 1);
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padL + step * i;
    const y = padT + plotH - (Math.max(0, p.attention) / max) * plotH;
    return { x, y };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Element attention time series"
      data-testid="drill-in-chart"
    >
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="stroke-slate-200" strokeWidth={1} />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-slate-200" strokeWidth={1} />
      {/* Path */}
      <path d={path} fill="none" className="stroke-brand-600" strokeWidth={2} />
      {/* Dots */}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} className="fill-brand-600" />
      ))}
    </svg>
  );
}