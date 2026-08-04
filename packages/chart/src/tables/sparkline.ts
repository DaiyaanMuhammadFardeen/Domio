/**
 * Sparkline — tiny inline charts as polyline SVG elements.
 */

import type { SvgElement } from '../types.js';
import { polyline, rect } from '../render/element.js';

export interface SparklineOptions {
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
}

/**
 * Generate a sparkline from an array of numbers.
 * Returns SVG elements (polyline + optional dots).
 */
export function sparkline(
  values: number[],
  semanticId: string,
  opts: SparklineOptions = {},
): SvgElement[] {
  const w = opts.width ?? 100;
  const h = opts.height ?? 24;
  const color = opts.color ?? '#4F46E5';

  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: (i / Math.max(values.length - 1, 1)) * w,
    y: h - ((v - min) / range) * h,
  }));

  const elements: SvgElement[] = [];

  // Background
  elements.push(rect(0, 0, w, h, `${semanticId}_bg`, {
    fill: 'transparent',
  }));

  // Polyline
  elements.push(polyline(points, semanticId, {
    stroke: color,
    strokeWidth: 1.5,
  }));

  // Dots
  if (opts.showDots) {
    points.forEach((p, i) => {
      elements.push(rect(p.x - 1.5, p.y - 1.5, 3, 3, `${semanticId}_dot_${i}`, {
        fill: color,
        rx: 1.5,
      }));
    });
  }

  return elements;
}
