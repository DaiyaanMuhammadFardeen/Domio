/**
 * Pie chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { createElement, text } from '../render/element.js';

const PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
];

/** Render a pie chart from a dataset. */
export function renderPie(
  dataset: Dataset,
  opts: RenderOptions,
  binding: BindingSchema,
): SvgElement[] {
  if (dataset.rows.length === 0) return [];

  const labelBinding = binding.columns.find((c) => c.role === 'label');
  const valueBinding = binding.columns.find((c) => c.role === 'value');
  if (!labelBinding || !valueBinding) return [];

  const W = opts.width;
  const H = opts.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 20;

  const labels = dataset.rows.map((r) => String(r[labelBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? Math.abs(v) : 0;
  });

  const total = values.reduce((a, b) => a + b, 0) || 1;
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
  const textColor = theme === 'dark' ? '#e2e8f0' : '#1e293b';

  let startAngle = -Math.PI / 2;

  labels.forEach((label, i) => {
    const sliceAngle = (values[i]! / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    // Path data for arc
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    elements.push(
      createElement({
        kind: 'path',
        semanticId: `slice_${i}`,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        d,
        fill: PALETTE[i % PALETTE.length],
      }),
    );

    // Label
    const midAngle = startAngle + sliceAngle / 2;
    const lx = cx + R * 0.65 * Math.cos(midAngle);
    const ly = cy + R * 0.65 * Math.sin(midAngle);
    elements.push(
      text(lx - 20, ly, label, `slice_label_${i}`, {
        width: 40,
        height: 16,
        fontSize: (opts.fontSize ?? 12) - 1,
        fill: '#ffffff',
        textAnchor: 'middle',
      }),
    );

    startAngle = endAngle;
  });

  // Center total
  elements.push(
    text(cx - 30, cy - 8, String(Math.round(total)), 'total', {
      width: 60,
      height: 24,
      fontSize: (opts.fontSize ?? 14) + 4,
      fill: textColor,
      textAnchor: 'middle',
      fontWeight: 700,
    }),
  );

  return elements;
}
