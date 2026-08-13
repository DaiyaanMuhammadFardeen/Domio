/**
 * SnapEngine — helper that, given a candidate element rect and the
 * current guides, returns the snapped coordinates and the guides
 * that contributed.
 *
 * Wave 2 §S2.1. The engine is a pure helper so we can unit-test the
 * snap math without rendering anything. The hook consuming it (the
 * drag-loop in the canvas's pointer handler, which arrives in a
 * later sub-phase) iterates each axis separately to keep the math
 * obvious.
 *
 * The math uses the canvas package's `snapToGrid` and `DEFAULT_GRID`
 * for grid snapping and the editor's `guides` slice for edge snaps.
 * The threshold (default 6 slide units) matches what Figma uses.
 */

import { DEFAULT_GRID, snapToGrid, type GridSpec } from '@domio/canvas';

export interface SnapCandidate {
  /** Candidate x (already transformed by zoom). */
  x: number;
  /** Candidate y. */
  y: number;
  /** Candidate width. */
  w: number;
  /** Candidate height. */
  h: number;
}

export interface SnapHint {
  /** Snapped x. */
  x: number;
  /** Snapped y. */
  y: number;
  /** IDs of the guides / grid lines that fired, in axis order. */
  triggered: ReadonlyArray<string>;
}

export interface SnapEngineInputs {
  /** Guides currently in the editor store. */
  guides: ReadonlyArray<{ id: string; orientation: 'horizontal' | 'vertical'; position: number }>;
  /** Grid spec; defaults to the canvas package's 8 px square. */
  grid?: GridSpec;
  /** Snap radius in slide units; defaults to 6. */
  radius?: number;
  /** When false, only edges snap (no grid). Defaults to true. */
  snapToGrid?: boolean;
}

export class SnapEngine {
  private readonly inputs: Required<SnapEngineInputs>;

  constructor(inputs: SnapEngineInputs) {
    this.inputs = {
      guides: inputs.guides,
      grid: inputs.grid ?? DEFAULT_GRID,
      radius: inputs.radius ?? 6,
      snapToGrid: inputs.snapToGrid ?? true,
    };
  }

  /**
   * Snap the candidate rect's four edges (left / right / centre-x,
   * top / bottom / centre-y) to the nearest guide or grid line.
   * Vertical guides snap horizontal positions; horizontal guides
   * snap vertical positions.
   */
  snap(candidate: SnapCandidate): SnapHint {
    const { guides, grid, radius, snapToGrid: gridEnabled } = this.inputs;
    const triggered: string[] = [];
    let x = candidate.x;
    let y = candidate.y;
    const cx = candidate.x + candidate.w / 2;
    const cy = candidate.y + candidate.h / 2;
    const right = candidate.x + candidate.w;
    const bottom = candidate.y + candidate.h;

    // Helper — pick the guide with the smallest |delta| within radius.
    const nearestV = (target: number): number | null => {
      let best: { value: number; delta: number } | null = null;
      for (const g of guides) {
        if (g.orientation !== 'vertical') continue;
        const delta = Math.abs(g.position - target);
        if (delta <= radius && (best === null || delta < best.delta)) {
          best = { value: g.position, delta };
        }
      }
      return best?.value ?? null;
    };
    const nearestH = (target: number): number | null => {
      let best: { value: number; delta: number } | null = null;
      for (const g of guides) {
        if (g.orientation !== 'horizontal') continue;
        const delta = Math.abs(g.position - target);
        if (delta <= radius && (best === null || delta < best.delta)) {
          best = { value: g.position, delta };
        }
      }
      return best?.value ?? null;
    };

    // Horizontal snap targets: left / centre / right.
    for (const target of [candidate.x, cx, right]) {
      const v = nearestV(target);
      if (v !== null) {
        x += v - target;
        triggered.push(`guide-v-${Math.round(v)}`);
        break;
      }
    }
    // Vertical snap targets: top / centre / bottom.
    for (const target of [candidate.y, cy, bottom]) {
      const h = nearestH(target);
      if (h !== null) {
        y += h - target;
        triggered.push(`guide-h-${Math.round(h)}`);
        break;
      }
    }

    if (gridEnabled) {
      const snappedX = snapToGrid(x, grid);
      const snappedY = snapToGrid(y, grid);
      if (Math.abs(snappedX - x) <= radius) {
        x = snappedX;
        triggered.push(`grid-${grid.kind}`);
      }
      if (Math.abs(snappedY - y) <= radius) {
        y = snappedY;
        triggered.push(`grid-${grid.kind}`);
      }
    }

    return { x, y, triggered };
  }
}
