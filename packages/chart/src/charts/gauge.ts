/**
 * Gauge chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { text, createElement } from '../render/element.js';

/** Render a gauge chart from a dataset. */
export function renderGauge(
  dataset: Dataset,
  opts: RenderOptions,
  binding: BindingSchema,
): SvgElement[] {
  if (dataset.rows.length === 0) return [];

  const valueBinding = binding.columns.find((c) => c.role === 'value');
  if (!valueBinding) return [];

  const W = opts.width;
  const H = opts.height;
  const cx = W / 2;
  const cy = H * 0.6;
  const R = Math.min(W, H) / 2 - 20;

  const v = Number(dataset.rows[0]![valueBinding.column]);
  const value = Number.isFinite(v) ? v : 0;
  const maxVal = 100;
  const ratio = Math.min(Math.max(value / maxVal, 0), 1);

  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';

  // Background arc
  const startAngle = Math.PI * 0.8;
  const endAngle = Math.PI * 2.2;
  const bgPath = describeArc(cx, cy, R, startAngle, endAngle);
  elements.push(
    createElement({
      kind: 'path',
      semanticId: 'gauge_bg',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      d: bgPath,
      stroke: theme === 'dark' ? '#334155' : '#e2e8f0',
      strokeWidth: 16,
    }),
  );

  // Value arc
  const valueAngle = startAngle + ratio * (endAngle - startAngle);
  const valPath = describeArc(cx, cy, R, startAngle, valueAngle);
  const color = ratio < 0.5 ? '#EF4444' : ratio < 0.8 ? '#F59E0B' : '#10B981';
  elements.push(
    createElement({
      kind: 'path',
      semanticId: 'gauge_value',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      d: valPath,
      stroke: color,
      strokeWidth: 16,
    }),
  );

  // Value text
  elements.push(
    text(cx - 30, cy - 10, String(Math.round(value)), 'gauge_value_text', {
      width: 60,
      height: 28,
      fontSize: (opts.fontSize ?? 14) + 8,
      fill: theme === 'dark' ? '#e2e8f0' : '#1e293b',
      textAnchor: 'middle',
      fontWeight: 700,
    }),
  );

  return elements;
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
