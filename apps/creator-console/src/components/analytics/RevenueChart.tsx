'use client';

import { useId, useMemo } from 'react';
import type { RevenuePoint } from '../../lib/types';

export interface RevenueChartProps {
  points: ReadonlyArray<RevenuePoint>;
  width?: number;
  height?: number;
}

/**
 * SVG bar chart for the revenue series.
 *
 * Renders one stacked bar per `RevenuePoint`: a tall bar segment for
 * gross revenue and a smaller overlay for refunds. The y-axis is
 * derived from the maximum `revenue_cents` value so empty periods
 * never crash rendering.
 */
export function RevenueChart({
  points,
  width = 720,
  height = 240,
}: RevenueChartProps) {
  const reactId = useId();
  const titleId = `revenue-chart-title-${reactId.replace(/:/g, '_')}`;

  const layout = useMemo(() => {
    const padding = { top: 16, right: 16, bottom: 28, left: 48 };
    const innerW = Math.max(0, width - padding.left - padding.right);
    const innerH = Math.max(0, height - padding.top - padding.bottom);
    const maxRevenue = points.reduce(
      (m, p) => Math.max(m, p.revenue_cents),
      1,
    );
    const n = Math.max(1, points.length);
    const slot = innerW / n;
    const barW = Math.max(2, Math.min(28, slot * 0.7));
    return { padding, innerW, innerH, maxRevenue, n, slot, barW };
  }, [points, width, height]);

  const { padding, innerH, maxRevenue, n, slot, barW } = layout;
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => i / yTicks);

  return (
    <div data-testid="revenue-chart" className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>Revenue chart</title>
        {/* Y-axis gridlines + labels */}
        {ticks.map((t) => {
          const y = padding.top + innerH * (1 - t);
          const value = Math.round(maxRevenue * t);
          return (
            <g key={`yt-${t}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + layout.innerW}
                y2={y}
                stroke="rgb(226 232 240)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y}
                fontSize={10}
                fill="rgb(100 116 139)"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {`$${Math.round(value / 100)}`}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {points.map((p, i) => {
          const x = padding.left + slot * i + (slot - barW) / 2;
          const revenueH = (p.revenue_cents / maxRevenue) * innerH;
          const refundsH = (p.refunds_cents / maxRevenue) * innerH;
          const yRevenue = padding.top + innerH - revenueH;
          const yRefunds = yRevenue;
          return (
            <g key={`bar-${i}`} data-testid={`revenue-bar-${i}`}>
              <rect
                x={x}
                y={yRevenue}
                width={barW}
                height={Math.max(0, revenueH)}
                fill="rgb(37 99 235)"
                rx={2}
              />
              {refundsH > 0 ? (
                <rect
                  x={x}
                  y={yRefunds}
                  width={barW}
                  height={Math.max(0, refundsH)}
                  fill="rgb(244 63 94)"
                  fillOpacity={0.5}
                  rx={2}
                />
              ) : null}
            </g>
          );
        })}

        {/* X-axis baseline */}
        <line
          x1={padding.left}
          y1={padding.top + innerH}
          x2={padding.left + layout.innerW}
          y2={padding.top + innerH}
          stroke="rgb(148 163 184)"
          strokeWidth={1}
        />

        {/* X-axis tick labels — show every Nth point */}
        {points.map((p, i) => {
          const showLabel = n <= 14 || i === 0 || i === n - 1 || i % Math.ceil(n / 7) === 0;
          if (!showLabel) return null;
          const x = padding.left + slot * i + slot / 2;
          const d = new Date(p.timestamp_ms);
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          return (
            <text
              key={`xt-${i}`}
              x={x}
              y={padding.top + innerH + 18}
              fontSize={10}
              fill="rgb(100 116 139)"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
