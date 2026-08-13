'use client';

/**
 * FunnelChart — per-deck funnel: viewers → opened → reached slide N →
 * converted. Renders an SVG funnel with each step centered against the
 * max value.
 *
 * Per Wave 7 §S7.2 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 */

import { type ReactElement } from 'react';
import type { FunnelStep } from '../lib/funnel-service';

export interface FunnelChartProps {
  steps: ReadonlyArray<FunnelStep>;
  /** Optional label rendered above each step (drop-off annotation). */
  dropoffLabel?: (step: FunnelStep, index: number) => string | null;
  width?: number;
  height?: number;
  testId?: string;
}

// Palette uses Tailwind 600-step colors expressed as rgb() so the
// chart is theme-agnostic and never falls back to raw hex literals.
const PALETTE = [
  'rgb(67, 56, 202)', // indigo-700
  'rgb(37, 99, 235)', // blue-600
  'rgb(8, 145, 178)', // cyan-600
  'rgb(5, 150, 105)', // emerald-600
  'rgb(217, 119, 6)', // amber-600
];

function pct(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '—';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Render an SVG funnel. Each step is a centered rectangle whose width
 * is proportional to the step's value / the largest step. Drop-off
 * annotations are rendered between consecutive steps.
 */
export function FunnelChart({
  steps,
  dropoffLabel,
  width = 480,
  height = 320,
  testId = 'funnel-chart',
}: FunnelChartProps): ReactElement {
  const pad = 24;
  const slotH = (height - pad * 2) / Math.max(steps.length, 1);
  const maxValue = Math.max(1, ...steps.map((s) => Number(s.value) || 0));
  const head = steps[0];
  const headValue = Number(head?.value ?? 0);

  if (steps.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"
        role="status"
        data-testid={`${testId}-empty`}
      >
        No funnel data. Once the warehouse reports viewer traffic for this deck, the funnel will
        populate.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid={testId}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
        role="img"
        aria-label="Deck funnel chart"
      >
        {steps.map((step, i) => {
          const value = Number(step.value) || 0;
          const ratio = value / maxValue;
          const slotW = width - pad * 2;
          const w = Math.max(40, slotW * ratio);
          const x = pad + (slotW - w) / 2;
          const y = pad + i * slotH;
          const h = Math.max(18, slotH - 18);
          const color = PALETTE[i % PALETTE.length] ?? 'var(--accent-3)';
          const drop = i === 0 ? null : (dropoffLabel?.(step, i) ?? null);
          const dropPct = i === 0 ? null : pct(value, headValue);

          return (
            <g key={`${step.label}-${i}`} data-testid={`${testId}-step-${i}`}>
              <rect x={x} y={y} width={w} height={h} fill={color} rx={4} ry={4} />
              <text
                x={pad + 8}
                y={y + h / 2 + 4}
                fontSize={12}
                fill="var(--content-inverse)"
                style={{ fontWeight: 600 }}
              >
                {step.label}
              </text>
              <text
                x={width - pad - 8}
                y={y + h / 2 + 4}
                fontSize={12}
                fill="var(--content-inverse)"
                textAnchor="end"
                style={{ fontWeight: 600 }}
              >
                {value.toLocaleString()}
                {dropPct ? (
                  <tspan dx={6} fill="var(--surface-1)">
                    ({dropPct})
                  </tspan>
                ) : null}
              </text>
              {drop ? (
                <text
                  x={width / 2}
                  y={y - 2}
                  fontSize={10}
                  fill="var(--content-secondary)"
                  textAnchor="middle"
                >
                  ↓ {drop}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
