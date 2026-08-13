/**
 * Treemap chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text } from '../render/element.js';

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

/** Render a treemap from a dataset. */
export function renderTreemap(
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
  const pad = 10;

  const labels = dataset.rows.map((r) => String(r[labelBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? Math.abs(v) : 1;
  });

  const total = values.reduce((a, b) => a + b, 0) || 1;
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';

  // Simple squarified-ish layout: split into rows
  let x = pad;
  let y = pad;
  let rowH = H - pad * 2;

  labels.forEach((label, i) => {
    const ratio = values[i]! / total;
    const area = ratio * (W - pad * 2) * (H - pad * 2);
    const w = Math.max(20, area / rowH);
    const h = rowH;

    if (x + w > W - pad) {
      x = pad;
      y += rowH;
      rowH = H - pad * 2 - (y - pad) || 20;
    }

    elements.push(
      rect(x, y, Math.min(w, W - pad - x), h, `tile_${i}`, {
        fill: PALETTE[i % PALETTE.length],
        stroke: theme === 'dark' ? '#1e293b' : '#ffffff',
        strokeWidth: 2,
      }),
    );
    elements.push(
      text(x + 4, y + h / 2 - 6, label, `tile_label_${i}`, {
        width: Math.min(w - 8, W - pad - x - 8),
        height: 14,
        fontSize: Math.min(opts.fontSize ?? 12, 14),
        fill: '#ffffff',
      }),
    );

    x += w;
  });

  return elements;
}
