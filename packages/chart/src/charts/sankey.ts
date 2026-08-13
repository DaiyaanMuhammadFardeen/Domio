/**
 * Sankey chart renderer (simplified flow diagram).
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { rect, text, line as svgLine } from '../render/element.js';

const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444'];

/** Render a simplified sankey from a dataset. */
export function renderSankey(
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
  const pad = 30;

  const sources = new Set<string>();
  const targets = new Set<string>();
  const flows: Array<{ from: string; to: string; value: number }> = [];

  for (const row of dataset.rows) {
    const from = String(row[xBinding.column] ?? '');
    const to = String(row[yBinding.column] ?? '');
    const v = Number(row[valueBinding.column]);
    sources.add(from);
    targets.add(to);
    flows.push({ from, to, value: Number.isFinite(v) ? v : 0 });
  }

  const srcList = [...sources];
  const tgtList = [...targets];
  const maxVal = Math.max(...flows.map((f) => f.value), 1);
  const elements: SvgElement[] = [];

  // Left column (sources)
  srcList.forEach((s, i) => {
    const y = pad + (i * (H - pad * 2)) / Math.max(srcList.length - 1, 1);
    elements.push(
      rect(pad, y - 12, 100, 24, `src_${i}`, {
        fill: PALETTE[i % PALETTE.length],
        rx: 4,
      }),
    );
    elements.push(
      text(pad + 8, y - 4, s, `src_label_${i}`, {
        width: 84,
        height: 16,
        fontSize: opts.fontSize ?? 11,
        fill: '#ffffff',
      }),
    );
  });

  // Right column (targets)
  tgtList.forEach((t, i) => {
    const y = pad + (i * (H - pad * 2)) / Math.max(tgtList.length - 1, 1);
    elements.push(
      rect(W - pad - 100, y - 12, 100, 24, `tgt_${i}`, {
        fill: PALETTE[(i + 2) % PALETTE.length],
        rx: 4,
      }),
    );
    elements.push(
      text(W - pad - 92, y - 4, t, `tgt_label_${i}`, {
        width: 84,
        height: 16,
        fontSize: opts.fontSize ?? 11,
        fill: '#ffffff',
      }),
    );
  });

  // Flows (simplified as lines)
  flows.forEach((f, i) => {
    const srcIdx = srcList.indexOf(f.from);
    const tgtIdx = tgtList.indexOf(f.to);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const sy = pad + (srcIdx * (H - pad * 2)) / Math.max(srcList.length - 1, 1);
    const ty = pad + (tgtIdx * (H - pad * 2)) / Math.max(tgtList.length - 1, 1);
    const sw = Math.max(1, (f.value / maxVal) * 8);

    elements.push(
      svgLine(pad + 100, sy, W - pad - 100, ty, `flow_${i}`, {
        stroke: PALETTE[srcIdx % PALETTE.length],
        strokeWidth: sw,
      }),
    );
  });

  return elements;
}
