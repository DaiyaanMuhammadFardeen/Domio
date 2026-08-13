'use client';

/**
 * SeatUsageChart — inline SVG line chart.
 *
 * Per Wave 8 §S8.7. Renders the last N days of seat usage as a
 * polyline with x-axis (date) and y-axis (seats). Pure visual; no
 * interactivity. Mirrors the `ScoreTrendChart` component used by the
 * brand-governance dashboard.
 */

import type { SeatUsagePoint } from '../../lib/types';

export interface SeatUsageChartProps {
  readonly points: ReadonlyArray<SeatUsagePoint>;
  readonly width?: number;
  readonly height?: number;
}

export function SeatUsageChart({
  points,
  width = 640,
  height = 200,
}: SeatUsageChartProps) {
  if (points.length === 0) {
    return (
      <svg
        data-testid="seat-usage-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Seat usage history"
      />
    );
  }

  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 30;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const minDate = points[0]!.date_ms;
  const maxDate = points[points.length - 1]!.date_ms;
  const dateSpan = Math.max(1, maxDate - minDate);

  const seats = points.map((p) => p.seats_used);
  const minSeats = Math.min(...seats);
  const maxSeats = Math.max(...seats);
  // Pad the y-axis range so the line doesn't touch the top/bottom.
  const lo = Math.max(0, Math.floor((minSeats - 2) / 5) * 5);
  const hi = Math.ceil((maxSeats + 2) / 5) * 5;
  const seatsSpan = Math.max(1, hi - lo);

  const coords = points.map((p) => {
    const x = padLeft + ((p.date_ms - minDate) / dateSpan) * innerW;
    const y = padTop + innerH - ((p.seats_used - lo) / seatsSpan) * innerH;
    return { x, y };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const yTicks = 4;
  const yLabels: Array<{ y: number; value: number }> = [];
  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const value = Math.round(lo + seatsSpan * (1 - ratio));
    const y = padTop + ratio * innerH;
    yLabels.push({ y, value });
  }

  const xTickCount = Math.min(6, points.length);
  const xLabels: Array<{ x: number; date_ms: number }> = [];
  for (let i = 0; i < xTickCount; i += 1) {
    const idx = Math.round((i / (xTickCount - 1)) * (points.length - 1));
    const pt = points[idx] ?? points[points.length - 1]!;
    const x = padLeft + ((pt.date_ms - minDate) / dateSpan) * innerW;
    xLabels.push({ x, date_ms: pt.date_ms });
  }

  function fmtDate(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }

  return (
    <svg
      data-testid="seat-usage-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Seat usage history"
      className="block"
    >
      {/* Y-axis grid + labels */}
      {yLabels.map((t) => (
        <g key={`y-${t.value}`}>
          <line
            x1={padLeft}
            y1={t.y}
            x2={padLeft + innerW}
            y2={t.y}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
          <text
            x={padLeft - 6}
            y={t.y + 3}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.6}
          >
            {t.value}
          </text>
        </g>
      ))}

      {/* X-axis */}
      <line
        x1={padLeft}
        y1={padTop + innerH}
        x2={padLeft + innerW}
        y2={padTop + innerH}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={1}
      />

      {/* X-axis labels */}
      {xLabels.map((t, i) => (
        <text
          key={`x-${i}`}
          x={t.x}
          y={padTop + innerH + 16}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          fillOpacity={0.6}
        >
          {fmtDate(t.date_ms)}
        </text>
      ))}

      {/* Line */}
      <polyline
        data-testid="seat-usage-line"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />
    </svg>
  );
}
