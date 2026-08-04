/**
 * Bullet chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text } from '../render/element.js';

/** Render a bullet chart from a dataset. */
export function renderBullet(
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
  const padL = 80;
  const padR = 20;
  const padT = 20;
  const padB = 20;
  const plotW = W - padL - padR;

  const labels = dataset.rows.map((r) => String(r[labelBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const maxVal = Math.max(...values, 1) * 1.2;
  const n = labels.length;
  const slotH = (H - padT - padB) / n;
  const barH = Math.min(24, slotH * 0.5);
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
  const mutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';

  labels.forEach((label, i) => {
    const cy = padT + i * slotH + slotH / 2;
    const v = values[i]!;
    const w = (v / maxVal) * plotW;

    // Background range
    elements.push(rect(padL, cy - barH / 2, plotW, barH, `bg_${i}`, {
      fill: theme === 'dark' ? '#1e293b' : '#f1f5f9',
    }));

    // Value bar
    elements.push(rect(padL, cy - barH / 2, w, barH, `bar_${i}`, {
      fill: '#4F46E5',
    }));

    // Label
    elements.push(text(4, cy - 6, label, `label_${i}`, {
      width: padL - 8,
      height: 14,
      fontSize: (opts.fontSize ?? 11) - 1,
      fill: mutedColor,
    }));
  });

  return elements;
}
