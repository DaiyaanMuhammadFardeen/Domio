/**
 * Waterfall chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text, line as svgLine } from '../render/element.js';

/** Render a waterfall chart from a dataset. */
export function renderWaterfall(
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

  const labels = dataset.rows.map((r) => String(r[xBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[yBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const n = labels.length;
  const slot = plotW / n;
  const barW = Math.min(48, slot * 0.6);
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
  const mutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';

  let cumulative = 0;

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

  labels.forEach((label, i) => {
    const cx = padL + slot * i + slot / 2;
    const v = values[i]!;
    const startY = padT + plotH / 2 - (cumulative / maxAbs) * (plotH / 2);
    cumulative += v;
    const endY = padT + plotH / 2 - (cumulative / maxAbs) * (plotH / 2);

    const top = Math.min(startY, endY);
    const h = Math.abs(endY - startY);
    const color = v >= 0 ? '#10B981' : '#EF4444';

    elements.push(rect(cx - barW / 2, top, barW, Math.max(h, 1), `bar_${i}`, { fill: color }));
    elements.push(
      text(cx - slot / 2, H - 30, label, `label_${i}`, {
        width: slot,
        height: 16,
        fontSize: opts.fontSize ?? 11,
        fill: mutedColor,
        textAnchor: 'middle',
      }),
    );
  });

  return elements;
}
