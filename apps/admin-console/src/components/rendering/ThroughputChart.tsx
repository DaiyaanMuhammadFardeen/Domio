'use client';

/**
 * ThroughputChart — inline SVG line chart for render queue throughput.
 *
 * Per Wave 8 §S8.11. Two stacked series: jobs/minute (brand) and
 * errors/minute (danger). Pure visual — no interactivity.
 */

import type { RenderThroughputPoint } from '../../lib/types';

export interface ThroughputChartProps {
  readonly points: ReadonlyArray<RenderThroughputPoint>;
  readonly width?: number;
  readonly height?: number;
}

export function ThroughputChart({
  points,
  width = 640,
  height = 180,
}: ThroughputChartProps) {
  if (points.length === 0) {
    return (
      <svg
        data-testid="throughput-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Render throughput"
      />
    );
  }

  const padX = 8;
  const padY = 12;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const maxJobs =
    Math.max(1, ...points.map((p) => p.jobs_per_minute)) * 1.15;
  const maxErrors =
    Math.max(1, ...points.map((p) => p.errors_per_minute)) * 1.15;

  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const jobCoords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (p.jobs_per_minute / maxJobs) * innerH,
  }));
  const errCoords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (p.errors_per_minute / maxErrors) * innerH,
  }));

  const jobLine = jobCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const errLine = errCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      data-testid="throughput-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Render throughput (24h)"
      className="block"
    >
      <line
        x1={padX}
        y1={padY + innerH}
        x2={padX + innerW}
        y2={padY + innerH}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <polyline
        data-testid="throughput-line-jobs"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.85}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={jobLine}
      />
      <polyline
        data-testid="throughput-line-errors"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={errLine}
      />
    </svg>
  );
}
