/**
 * Funnel chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text } from '../render/element.js';

const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444'];

/** Render a funnel chart from a dataset. */
export function renderFunnel(
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
  const pad = 30;
  const plotW = W - pad * 2;
  const n = dataset.rows.length;
  const slotH = (H - pad * 2) / n;

  const labels = dataset.rows.map((r) => String(r[labelBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? Math.abs(v) : 0;
  });

  const maxVal = Math.max(...values, 1);
  const elements: SvgElement[] = [];

  labels.forEach((label, i) => {
    const ratio = values[i]! / maxVal;
    const w = plotW * ratio;
    const x = pad + (plotW - w) / 2;
    const y = pad + i * slotH;

    elements.push(
      rect(x, y, w, slotH - 4, `funnel_${i}`, {
        fill: PALETTE[i % PALETTE.length],
        rx: 4,
      }),
    );
    elements.push(
      text(x + 10, y + slotH / 2 - 8, label, `funnel_label_${i}`, {
        width: w - 20,
        height: 16,
        fontSize: opts.fontSize ?? 12,
        fill: '#ffffff',
      }),
    );
  });

  return elements;
}
