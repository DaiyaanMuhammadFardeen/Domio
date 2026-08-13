/**
 * Bar chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text, line as svgLine } from '../render/element.js';

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

/** Render a bar chart from a dataset. */
export function renderBar(
  dataset: Dataset,
  opts: RenderOptions,
  binding: BindingSchema,
): SvgElement[] {
  if (dataset.rows.length === 0) return [];

  const xBinding = binding.columns.find((c) => c.role === 'x');
  const yBinding = binding.columns.find((c) => c.role === 'y');
  if (!xBinding || !yBinding) return [];

  const W = opts.width;
  const H = opts.height;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Extract data
  const labels = dataset.rows.map((r) => String(r[xBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[yBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const slot = plotW / n;
  const barW = Math.min(56, slot * 0.55);

  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
  const textColor = theme === 'dark' ? '#e2e8f0' : '#1e293b';
  const mutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';

  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    elements.push(
      svgLine(padL, y, W - padR, y, `grid_${i}`, {
        stroke: theme === 'dark' ? '#334155' : '#e2e8f0',
        strokeWidth: 1,
      }),
    );
  }

  // Bars
  labels.forEach((label, i) => {
    const cx = padL + slot * i + slot / 2;
    const h = (Math.abs(values[i]!) / maxVal) * plotH;
    const y = padT + plotH - h;
    const color = PALETTE[i % PALETTE.length]!;

    elements.push(rect(cx - barW / 2, y, barW, h, `bar_${i}`, { fill: color }));
    elements.push(
      text(cx - slot / 2, H - 30, label, `bar_label_${i}`, {
        width: slot,
        height: 18,
        fontSize: opts.fontSize ?? 12,
        fill: mutedColor,
        textAnchor: 'middle',
      }),
    );

    if (opts.showValues !== false && h > 20) {
      elements.push(
        text(cx - 30, y - 5, String(Math.round(values[i]!)), `bar_value_${i}`, {
          width: 60,
          height: 16,
          fontSize: (opts.fontSize ?? 12) - 1,
          fill: textColor,
          textAnchor: 'middle',
          fontWeight: 600,
        }),
      );
    }
  });

  return elements;
}
