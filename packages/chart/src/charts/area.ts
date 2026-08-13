/**
 * Area chart renderer (filled line chart).
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { text, line as svgLine, polyline } from '../render/element.js';

/** Render an area chart from a dataset. */
export function renderArea(
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

  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
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

  if (n > 1) {
    const points = values.map((v, i) => ({
      x: padL + (plotW / (n - 1)) * i,
      y: padT + plotH - (v / maxVal) * plotH,
    }));

    // Filled area
    const fillPoints = [
      { x: points[0]!.x, y: padT + plotH },
      ...points,
      { x: points[points.length - 1]!.x, y: padT + plotH },
    ];
    elements.push(
      polyline(fillPoints, 'area', {
        fill: 'rgba(79,70,229,0.25)',
        stroke: 'rgba(79,70,229,0.6)',
        strokeWidth: 2,
      }),
    );
  }

  // Labels
  labels.forEach((label, i) => {
    const x = padL + (plotW / Math.max(n - 1, 1)) * i;
    elements.push(
      text(Math.min(W - 80, Math.max(0, x - 40)), H - 30, label, `label_${i}`, {
        width: 80,
        height: 18,
        fontSize: opts.fontSize ?? 12,
        fill: mutedColor,
        textAnchor: 'middle',
      }),
    );
  });

  return elements;
}
