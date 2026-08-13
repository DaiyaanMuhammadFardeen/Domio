/**
 * Drag controller — owns the in-flight drag state and emits ephemeral
 * transforms during the gesture, then a single committed `MoveOp` on
 * pointer-up (see docs/development_phases/phase-03 §C.2).
 */

import type { Transform2D, ULID } from '@domio/schema';
import { snapDelta, constrainToAxis, type SnapMode } from '../input/snap.js';

export interface DragInit {
  targetIds: ULID[];
  startPositions: Map<ULID, Transform2D>;
  startPointer: { x: number; y: number };
  gridStep?: number;
  snapMode?: SnapMode;
  altOverride?: boolean;
  shift?: boolean;
}

export class DragController {
  private readonly init: DragInit;
  private startedAtMs = 0;
  private firstFrameMs = 0;
  private firstFrameEmitted = false;

  constructor(init: DragInit) {
    this.init = init;
    this.startedAtMs = performance.now();
  }

  startedAt(): number {
    return this.startedAtMs;
  }

  /** First-frame latency for the gesture. */
  firstFrameLatency(): number {
    return this.firstFrameMs - this.startedAtMs;
  }

  /**
   * Compute the ephemeral transforms for the current pointer position.
   * Returns an empty map if first frame has not yet been emitted.
   */
  update(current: { x: number; y: number }): Map<ULID, Transform2D> {
    const raw = constrainToAxis(this.init.startPointer, current, this.init.shift ?? false);
    // Treat sub-pixel motion as a no-op so snap doesn't teleport the layer
    // back onto its grid step when the user hasn't actually moved yet.
    if (Math.hypot(raw.dx, raw.dy) < 1) {
      const out = new Map<ULID, Transform2D>();
      for (const [id, start] of this.init.startPositions) {
        out.set(id, { ...start });
      }
      return out;
    }
    const snapped = snapDelta(
      raw,
      { x: this.init.startPointer.x, y: this.init.startPointer.y },
      {
        mode: this.init.snapMode ?? 'grid',
        gridStep: this.init.gridStep ?? 8,
        altOverride: this.init.altOverride,
      },
    );
    const out = new Map<ULID, Transform2D>();
    for (const [id, start] of this.init.startPositions) {
      out.set(id, {
        ...start,
        x: start.x + snapped.dx,
        y: start.y + snapped.dy,
      });
    }
    if (!this.firstFrameEmitted) {
      this.firstFrameMs = performance.now();
      this.firstFrameEmitted = true;
    }
    return out;
  }

  /**
   * Final transforms returned to the history engine on commit.
   */
  finalize(current: { x: number; y: number }): Map<ULID, Transform2D> {
    return this.update(current);
  }

  /**
   * True when the drag did not move (within the pixel threshold).
   */
  isNoop(current: { x: number; y: number }): boolean {
    const raw = constrainToAxis(this.init.startPointer, current, this.init.shift ?? false);
    return Math.hypot(raw.dx, raw.dy) < 1;
  }
}
