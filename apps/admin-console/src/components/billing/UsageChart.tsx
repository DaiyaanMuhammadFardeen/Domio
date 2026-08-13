'use client';

/**
 * UsageChart — inline SVG line/area chart for billing usage series.
 *
 * Per Wave 10 §S10.6. Pure visual — no interactivity, no external
 * charting library. Each metric uses a distinct brand color so the
 * four charts are visually distinguishable when stacked.
 */

import type { UsageMetric, UsagePoint } from '../../lib/billing-service';

export interface UsageChartProps {
  readonly metric: UsageMetric;
  readonly series: ReadonlyArray<UsagePoint>;
  readonly width?: number;
  readonly height?: number;
}

const METRIC_COLORS: Readonly<Record<UsageMetric, { stroke: string; fill: string }>> = {
  api_calls: { stroke: 'var(--accent-2)', fill: 'color-mix(in srgb, var(--accent-2) 18%, transparent)' },
  ai_tokens: { stroke: 'var(--accent-9)', fill: 'color-mix(in srgb, var(--accent-9) 18%, transparent)' },
  render_minutes: { stroke: 'var(--success)', fill: 'color-mix(in srgb, var(--success) 18%, transparent)' },
  export_minutes: { stroke: 'var(--warning)', fill: 'color-mix(in srgb, var(--warning) 18%, transparent)' },
};

const METRIC_LABEL: Readonly<Record<UsageMetric, string>> = {
  api_calls: 'API calls per day',
  ai_tokens: 'AI tokens per day',
  render_minutes: 'Render minutes per day',
  export_minutes: 'Export minutes per day',
};

export function UsageChart({
  metric,
  series,
  width = 720,
  height = 220,
}: UsageChartProps) {
  const padX = 12;
  const padY = 16;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = Math.max(0, height - padY * 2);

  if (series.length === 0) {
    return (
      <svg
        data-testid="usage-chart"
        data-metric={metric}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={METRIC_LABEL[metric]}
        className="block w-full text-slate-400"
      >
        <line
          x1={padX}
          y1={padY + innerH}
          x2={padX + innerW}
          y2={padY + innerH}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const max = Math.max(1, ...series.map((p) => p.value)) * 1.1;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const coords = series.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (p.value / max) * innerH,
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const last = coords[coords.length - 1];
  const first = coords[0];
  const areaPath =
    last && first
      ? `${linePath} L${last.x.toFixed(1)},${(padY + innerH).toFixed(1)} L${first.x.toFixed(1)},${(padY + innerH).toFixed(1)} Z`
      : '';

  const colors = METRIC_COLORS[metric];

  return (
    <svg
      data-testid="usage-chart"
      data-metric={metric}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={METRIC_LABEL[metric]}
      className="block w-full"
    >
      {/* baseline */}
      <line
        x1={padX}
        y1={padY + innerH}
        x2={padX + innerW}
        y2={padY + innerH}
        stroke="var(--border-default)"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      {/* mid-line (50%) */}
      <line
        x1={padX}
        y1={padY + innerH / 2}
        x2={padX + innerW}
        y2={padY + innerH / 2}
        stroke="var(--border-default)"
        strokeOpacity={0.15}
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      {areaPath ? (
        <path d={areaPath} fill={colors.fill} stroke="none" />
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* endpoint dot */}
      {last ? (
        <circle
          cx={last.x}
          cy={last.y}
          r={3.5}
          fill={colors.stroke}
          stroke="var(--surface-0)"
          strokeWidth={1.5}
        />
      ) : null}
    </svg>
  );
}
