/**
 * Snap — pixel-perfect and snap-to-grid (see docs/development_phases/phase-03
 * §C.2: SnapMode `none | pixel | grid`).
 *
 * The actual snap resolution for smart alignment (guides) lives in
 * `packages/canvas/src/guides/alignment.ts`. This module handles the
 * coarse positional snapping used while dragging.
 */

export type SnapMode = 'none' | 'pixel' | 'grid';

export interface SnapOptions {
  mode: SnapMode;
  /** Grid step in world units. */
  gridStep?: number | undefined;
  /** When true (Alt held), snap is disabled mid-drag. */
  altOverride?: boolean | undefined;
}

export interface SnapResult {
  dx: number;
  dy: number;
  snappedX: boolean;
  snappedY: boolean;
}

export function snapDelta(
  delta: { dx: number; dy: number },
  origin: { x: number; y: number },
  options: SnapOptions,
): SnapResult {
  if (options.altOverride) {
    return { dx: delta.dx, dy: delta.dy, snappedX: false, snappedY: false };
  }
  if (options.mode === 'none') {
    return { dx: delta.dx, dy: delta.dy, snappedX: false, snappedY: false };
  }
  if (options.mode === 'pixel') {
    return {
      dx: Math.round(delta.dx),
      dy: Math.round(delta.dy),
      snappedX: delta.dx !== Math.round(delta.dx),
      snappedY: delta.dy !== Math.round(delta.dy),
    };
  }
  const step = options.gridStep ?? 8;
  const targetX = origin.x + delta.dx;
  const targetY = origin.y + delta.dy;
  const snappedX = Math.round(targetX / step) * step;
  const snappedY = Math.round(targetY / step) * step;
  return {
    dx: snappedX - origin.x,
    dy: snappedY - origin.y,
    snappedX: snappedX !== targetX,
    snappedY: snappedY !== targetY,
  };
}

/**
 * Shift constrains the drag to a single axis (horizontal or vertical) —
 * whichever the user starts moving first wins.
 */
export function constrainToAxis(
  start: { x: number; y: number },
  current: { x: number; y: number },
  shift: boolean,
): { dx: number; dy: number } {
  if (!shift) return { dx: current.x - start.x, dy: current.y - start.y };
  const ax = Math.abs(current.x - start.x);
  const ay = Math.abs(current.y - start.y);
  if (ax >= ay) return { dx: current.x - start.x, dy: 0 };
  return { dx: 0, dy: current.y - start.y };
}
