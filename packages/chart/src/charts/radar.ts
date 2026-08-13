/**
 * Radar chart renderer.
 */

import type { Dataset, RenderOptions, SvgElement, BindingSchema } from '../types.js';
import { line as svgLine, polyline, text } from '../render/element.js';

/** Render a radar chart from a dataset. */
export function renderRadar(
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
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 30;

  const labels = dataset.rows.map((r) => String(r[labelBinding.column] ?? ''));
  const values = dataset.rows.map((r) => {
    const v = Number(r[valueBinding.column]);
    return Number.isFinite(v) ? v : 0;
  });

  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const elements: SvgElement[] = [];
  const theme = opts.theme ?? 'light';
  const mutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';

  // Grid rings
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (R * ring) / 4;
    const points = Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return { x: cx + rr * Math.cos(angle), y: cy + rr * Math.sin(angle) };
    });
    elements.push(
      polyline(points, `ring_${ring}`, {
        stroke: theme === 'dark' ? '#334155' : '#e2e8f0',
        strokeWidth: 1,
      }),
    );
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    elements.push(
      svgLine(cx, cy, cx + R * Math.cos(angle), cy + R * Math.sin(angle), `axis_${i}`, {
        stroke: theme === 'dark' ? '#334155' : '#e2e8f0',
        strokeWidth: 1,
      }),
    );
  }

  // Data polygon
  const dataPoints = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (v / maxVal) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  elements.push(
    polyline(dataPoints, 'data', {
      fill: 'rgba(79,70,229,0.25)',
      stroke: '#4F46E5',
      strokeWidth: 2,
    }),
  );

  // Labels
  labels.forEach((label, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lx = cx + (R + 16) * Math.cos(angle);
    const ly = cy + (R + 16) * Math.sin(angle);
    elements.push(
      text(lx - 20, ly - 6, label, `label_${i}`, {
        width: 40,
        height: 14,
        fontSize: (opts.fontSize ?? 11) - 1,
        fill: mutedColor,
        textAnchor: 'middle',
      }),
    );
  });

  return elements;
}
