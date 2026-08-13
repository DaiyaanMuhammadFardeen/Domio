/**
 * Spacing hints — visualizes gaps between adjacent layers. See
 * docs/development_phases/phase-03 §C.3: spacing hints appear when the gap
 * matches a third element's edge.
 */

import type { Aabb } from '../renderer/camera.js';
import type { SceneGraph } from '../scene/scene-graph.js';

export interface SpacingHint {
  axis: 'x' | 'y';
  position: number;
  length: number;
}

export function findSpacingHints(
  graph: SceneGraph,
  bounds: Aabb,
  skipIds: ReadonlySet<string>,
): SpacingHint[] {
  const index = graph.spatialIndex();
  const candidates = index.query({
    bounds: {
      x: bounds.x - 10_000,
      y: bounds.y - 10_000,
      w: bounds.w + 20_000,
      h: bounds.h + 20_000,
    },
    skip: (item) => {
      const node = graph.byId(item.id);
      if (!node || node.kind !== 'element') return true;
      if (skipIds.has(node.id)) return true;
      const element = node.ref as { locked?: boolean; hidden?: boolean };
      return element.hidden === true || element.locked === true;
    },
  });
  const hints: SpacingHint[] = [];
  for (const candidate of candidates) {
    const b = candidate.bounds;
    // Same row?
    const verticalOverlap = Math.min(b.y + b.h, bounds.y + bounds.h) - Math.max(b.y, bounds.y);
    if (verticalOverlap > 0) {
      const left = b.x + b.w < bounds.x ? b.x + b.w : null;
      const right = bounds.x + bounds.w < b.x ? b.x : null;
      if (left !== null) {
        hints.push({
          axis: 'x',
          position: (left + bounds.x) / 2,
          length: Math.abs(bounds.x - left),
        });
      } else if (right !== null) {
        hints.push({
          axis: 'x',
          position: (right + (bounds.x + bounds.w)) / 2,
          length: Math.abs(right - (bounds.x + bounds.w)),
        });
      }
    }
    const horizontalOverlap = Math.min(b.x + b.w, bounds.x + bounds.w) - Math.max(b.x, bounds.x);
    if (horizontalOverlap > 0) {
      const top = b.y + b.h < bounds.y ? b.y + b.h : null;
      const bottom = bounds.y + bounds.h < b.y ? b.y : null;
      if (top !== null) {
        hints.push({ axis: 'y', position: (top + bounds.y) / 2, length: Math.abs(bounds.y - top) });
      } else if (bottom !== null) {
        hints.push({
          axis: 'y',
          position: (bottom + (bounds.y + bounds.h)) / 2,
          length: Math.abs(bottom - (bounds.y + bounds.h)),
        });
      }
    }
  }
  return hints;
}
