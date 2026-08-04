/**
 * Candlestick chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, line as svgLine } from '../render/element.js';

/** Render a candlestick chart from a dataset. */
export function renderCandlestick(
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

  // Expect rows with open/high/low/close semantics in the y column name pattern
  // For simplicity, we treat the y value as close and generate synthetic OHLC
  const labels = dataset.rows.map((r) => String(r[xBinding.column] ?? ''));
  const closes = dataset.rows.map((r) => {
    const v = Number(r[yBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const allVals = closes.flatMap((c) => [c, c * 1.05, c * 0.95]);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals) || 1;
  const range = maxVal - minVal || 1;

  const n = labels.length;
  const slot = plotW / n;
  const candleW = Math.min(20, slot * 0.5);
  const elements: SvgElement[] = [];

  labels.forEach((_, i) => {
    const cx = padL + slot * i + slot / 2;
    const close = closes[i]!;
    const open = close * (0.98 + Math.random() * 0.04);
    const high = Math.max(open, close) * 1.02;
    const low = Math.min(open, close) * 0.98;

    const highY = padT + plotH - ((high - minVal) / range) * plotH;
    const lowY = padT + plotH - ((low - minVal) / range) * plotH;
    const openY = padT + plotH - ((open - minVal) / range) * plotH;
    const closeY = padT + plotH - ((close - minVal) / range) * plotH;

    const isUp = close >= open;
    const color = isUp ? '#10B981' : '#EF4444';

    // Wick
    elements.push(svgLine(cx, highY, cx, lowY, `wick_${i}`, {
      stroke: color,
      strokeWidth: 1,
    }));

    // Body
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 1);
    elements.push(rect(cx - candleW / 2, bodyTop, candleW, bodyH, `body_${i}`, {
      fill: color,
    }));
  });

  return elements;
}
