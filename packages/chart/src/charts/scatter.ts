/**
 * Scatter chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, line as svgLine } from '../render/element.js';

/** Render a scatter chart from a dataset. */
export function renderScatter(
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

  const xVals = dataset.rows.map((r) => {
    const v = Number(r[xBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });
  const yVals = dataset.rows.map((r) => {
    const v = Number(r[yBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals) || 1;
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals) || 1;

  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';

  // Axes
  elements.push(
    svgLine(padL, padT, padL, padT + plotH, 'y_axis', {
      stroke: theme === 'dark' ? '#475569' : '#cbd5e1',
      strokeWidth: 1,
    }),
  );
  elements.push(
    svgLine(padL, padT + plotH, padL + plotW, padT + plotH, 'x_axis', {
      stroke: theme === 'dark' ? '#475569' : '#cbd5e1',
      strokeWidth: 1,
    }),
  );

  // Points
  xVals.forEach((x, i) => {
    const px = padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const py = padT + plotH - ((yVals[i]! - yMin) / (yMax - yMin || 1)) * plotH;
    elements.push(
      rect(px - 4, py - 4, 8, 8, `point_${i}`, {
        fill: '#4F46E5',
        rx: 4,
      }),
    );
  });

  return elements;
}
