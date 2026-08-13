/**
 * Constraints — pin 'min' / 'center' / 'max' / 'stretch' / 'scale' per axis
 * (see docs/development_phases/phase-03 §B.3). Constraints run *after*
 * auto-layout per docs/editor-canvas.md §1 Feature 7.
 */

import type { LayerConstraints, Transform2D } from '@domio/schema';

export interface ConstraintsInput {
  parent: { x: number; y: number; w: number; h: number };
  parentPrev: { x: number; y: number; w: number; h: number };
  child: Transform2D;
  constraints?: LayerConstraints | undefined;
  /** Min/max size in world units used to clamp scale. */
  minSize?: number | undefined;
  maxSize?: number | undefined;
}

export function applyConstraints(input: ConstraintsInput): Transform2D {
  const { parent, parentPrev, child, constraints } = input;
  const out: Transform2D = { ...child };
  const dx = parent.x - parentPrev.x;
  const dy = parent.y - parentPrev.y;
  const sx = parentPrev.w === 0 ? 1 : parent.w / parentPrev.w;
  const sy = parentPrev.h === 0 ? 1 : parent.h / parentPrev.h;

  const h = constraints?.horizontal ?? 'min';
  const v = constraints?.vertical ?? 'min';

  out.x = applyAxis(out.x, child.w, parent.w, h, dx, sx);
  out.y = applyAxis(out.y, child.h, parent.h, v, dy, sy);

  if (constraints?.pinToCorners) {
    out.x = parent.x + child.x - parentPrev.x;
    out.y = parent.y + child.y - parentPrev.y;
  }
  return out;
}

function applyAxis(
  position: number,
  size: number,
  parentSize: number,
  mode: LayerConstraints['horizontal'] | LayerConstraints['vertical'],
  delta: number,
  scale: number,
): number {
  switch (mode) {
    case 'min':
      return position + delta;
    case 'max':
      return position + delta + (parentSize - (position + size));
    case 'center':
      return position + delta + (parentSize - (position + size)) / 2;
    case 'stretch':
      return position + delta;
    case 'scale':
      // scale factor is dimensionless; we leave position unchanged and let
      // the caller mutate size. For axis application we keep position
      // delta-proportional.
      return position + delta * scale;
    default:
      return position;
  }
}

export function clampSize(value: number, minSize: number, maxSize: number): number {
  return Math.min(maxSize, Math.max(minSize, value));
}
