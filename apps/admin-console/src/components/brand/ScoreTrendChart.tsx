'use client';

/**
 * ScoreTrendChart — inline SVG sparkline.
 *
 * Per Wave 8 §S8.2. Renders an SVG polyline + x/y axis for the last
 * N days of brand-score trend. Pure visual — no interactivity.
 */

import type { BrandScoreTrendPoint } from '../../lib/brand-governance-service';

export interface ScoreTrendChartProps {
  readonly points: ReadonlyArray<BrandScoreTrendPoint>;
  readonly width?: number;
  readonly height?: number;
}

export function ScoreTrendChart({
  points,
  width = 240,
  height = 60,
}: ScoreTrendChartProps) {
  if (points.length === 0) {
    return (
      <svg
        data-testid="score-trend-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Brand score trend"
      />
    );
  }

  const padX = 6;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const minScore = 0;
  const maxScore = 100;
  const span = Math.max(1, maxScore - minScore);

  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = padY + innerH - ((p.score - minScore) / span) * innerH;
    return { x, y };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <svg
      data-testid="score-trend-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Brand score trend"
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
        data-testid="score-trend-line"
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