/**
 * Transform command — translate / resize / rotate helpers used by the
 * history engine to build `MoveOp`, `ResizeOp`, `RotateOp` entries.
 */

import type { Transform2D, ULID } from '@domio/schema';

export type TransformKind = 'move' | 'resize' | 'rotate';

export interface TransformDelta {
  kind: TransformKind;
  id: ULID;
  from: Transform2D;
  to: Transform2D;
}

export function makeTransformDelta(
  id: ULID,
  from: Transform2D,
  to: Transform2D,
  kind: TransformKind,
): TransformDelta {
  return { id, from, to, kind };
}

export function moveDelta(from: Transform2D, dx: number, dy: number): Transform2D {
  return { ...from, x: from.x + dx, y: from.y + dy };
}

export function resizeDelta(from: Transform2D, handle: ResizeHandle, delta: number): Transform2D {
  switch (handle) {
    case 'n':
      return { ...from, y: from.y + delta, h: from.h - delta };
    case 's':
      return { ...from, h: from.h + delta };
    case 'e':
      return { ...from, w: from.w + delta };
    case 'w':
      return { ...from, x: from.x + delta, w: from.w - delta };
    case 'ne':
      return { ...from, y: from.y + delta, h: from.h - delta, w: from.w + delta };
    case 'nw':
      return {
        ...from,
        x: from.x + delta,
        y: from.y + delta,
        w: from.w - delta,
        h: from.h - delta,
      };
    case 'se':
      return { ...from, w: from.w + delta, h: from.h + delta };
    case 'sw':
      return { ...from, x: from.x + delta, w: from.w - delta, h: from.h + delta };
  }
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function rotateDelta(from: Transform2D, rotation: number): Transform2D {
  return { ...from, rotation };
}
