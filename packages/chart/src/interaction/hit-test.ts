/**
 * Hit testing — find the nearest interactive element to a point.
 */

import type { SvgElement, HitTarget } from '../types.js';

/**
 * Euclidean distance between two points.
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Find the nearest element to a given (x, y) coordinate.
 * Returns the closest HitTarget or null if none found.
 */
export function hitTest(
  elements: SvgElement[],
  x: number,
  y: number,
  maxDistance = 20,
): HitTarget | null {
  let best: HitTarget | null = null;

  for (const el of elements) {
    // Calculate center of element
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    // Check if point is inside element (bounding box)
    const inside =
      x >= el.x &&
      x <= el.x + el.width &&
      y >= el.y &&
      y <= el.y + el.height;

    const dist = inside ? 0 : distance(x, y, cx, cy);

    if (dist <= maxDistance && (!best || dist < best.distance)) {
      best = { element: el, distance: dist };
    }
  }

  return best;
}

/**
 * Find the nearest bar element by index from a set of bar_* elements.
 */
export function hitTestBar(
  elements: SvgElement[],
  x: number,
  y: number,
): number | null {
  const bars = elements.filter((el) => el.semanticId.startsWith('bar_'));
  const target = hitTest(bars, x, y, 50);

  if (target) {
    const match = target.element.semanticId.match(/^bar_(\d+)$/);
    if (match) return Number(match[1]);
  }

  return null;
}

/**
 * Find the nearest point element by index from a set of point_* elements.
 */
export function hitTestPoint(
  elements: SvgElement[],
  x: number,
  y: number,
): number | null {
  const points = elements.filter((el) => el.semanticId.startsWith('point_'));
  const target = hitTest(points, x, y, 20);

  if (target) {
    const match = target.element.semanticId.match(/^point_(\d+)$/);
    if (match) return Number(match[1]);
  }

  return null;
}
