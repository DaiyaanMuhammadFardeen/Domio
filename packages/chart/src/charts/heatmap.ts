/**
 * Heatmap chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text } from '../render/element.js';

/** Render a heatmap from a dataset. */
export function renderHeatmap(
  dataset: Dataset,
  opts: RenderOptions,
  binding: BindingSchema,
): SvgElement[] {
  if (dataset.rows.length === 0) return [];

  const xBinding = binding.columns.find((c) => c.role === 'x');
  const yBinding = binding.columns.find((c) => c.role === 'y');
  const valueBinding = binding.columns.find((c) => c.role === 'value');
  if (!xBinding || !yBinding || !valueBinding) return [];

  const W = opts.width;
  const H = opts.height;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 60;

  const xLabels = [...new Set(dataset.rows.map((r) => String(r[xBinding.column] ?? '')))];
  const yLabels = [...new Set(dataset.rows.map((r) => String(r[yBinding.column] ?? '')))];

  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values) || 1;

  const cellW = (W - padL - padR) / xLabels.length;
  const cellH = (H - padT - padB) / yLabels.length;
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';

  // Column labels
  xLabels.forEach((label, i) => {
    elements.push(
      text(padL + i * cellW + cellW / 2 - 20, H - padB + 16, label, `col_${i}`, {
        width: 40,
        height: 14,
        fontSize: (opts.fontSize ?? 11) - 1,
        fill: theme === 'dark' ? '#94a3b8' : '#64748b',
        textAnchor: 'middle',
      }),
    );
  });

  // Row labels + cells
  yLabels.forEach((yLabel, yi) => {
    elements.push(
      text(4, padT + yi * cellH + cellH / 2 - 6, yLabel, `row_${yi}`, {
        width: padL - 8,
        height: 14,
        fontSize: (opts.fontSize ?? 11) - 1,
        fill: theme === 'dark' ? '#94a3b8' : '#64748b',
      }),
    );

    xLabels.forEach((xLabel, xi) => {
      const row = dataset.rows.find(
        (r) =>
          String(r[xBinding.column] ?? '') === xLabel &&
          String(r[yBinding.column] ?? '') === yLabel,
      );
      const v = row ? Number(row[valueBinding.column]) : 0;
      const norm = maxVal === minVal ? 0.5 : (v - minVal) / (maxVal - minVal);

      // Blue to red color interpolation
      const r = Math.round(59 + norm * 196);
      const g = Math.round(130 - norm * 100);
      const b = Math.round(246 - norm * 200);
      const color = `rgb(${r},${g},${b})`;

      elements.push(
        rect(padL + xi * cellW, padT + yi * cellH, cellW - 2, cellH - 2, `cell_${yi}_${xi}`, {
          fill: color,
          rx: 2,
        }),
      );
    });
  });

  return elements;
}
