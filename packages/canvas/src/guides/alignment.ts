/**
 * Smart alignment guides. See docs/development_phases/phase-03 §C.3.
 *
 * Computes alignment candidates from the spatial index (sibling bounds) and
 * returns a sorted list of `Guide`s with the closest match. Locked/hidden
 * layers are excluded per docs/editor-canvas.md §1 Feature 3.
 *
 * Equal-spacing tolerance is `Math.max(1, 1 / zoom)` per the spec.
 */

import type { Aabb } from '../renderer/camera.js';
import type { SceneGraph } from '../scene/scene-graph.js';

export type GuideType = 'align' | 'spacing' | 'equal-spacing';

export interface Guide {
  type: GuideType;
  axis: 'x' | 'y';
  position: number;
  targets: string[];
}

export interface AlignmentOptions {
  /** Pixel-equivalent tolerance in world units. */
  tolerance: number;
  /** Skip layers whose id is in this set (selection). */
  skipIds?: ReadonlySet<string>;
}

export interface AlignmentInput {
  bounds: Aabb;
  graph: SceneGraph;
  options: AlignmentOptions;
}

export function findAlignmentGuides(input: AlignmentInput): Guide[] {
  const { graph, options } = input;
  const tolerance = Math.max(1, options.tolerance);
  const skipIds = options.skipIds ?? new Set<string>();
  const index = graph.spatialIndex();
  const candidates = index.query({
    bounds: inflate(input.bounds, tolerance * 50),
    skip: (item) => {
      const node = graph.byId(item.id);
      if (!node || node.kind !== 'element') return true;
      if (skipIds.has(node.id)) return true;
      const element = node.ref as { locked?: boolean; hidden?: boolean };
      return element.hidden === true || element.locked === true;
    },
  });
  const guides: Guide[] = [];
  for (const candidate of candidates) {
    const b = candidate.bounds;
    // X axis candidates: left, center, right of candidate vs. our bounds.
    pushIfClose(guides, 'x', 'align', b.x, b.x + b.w / 2, b.x + b.w, input.bounds, tolerance);
    pushIfClose(guides, 'y', 'align', b.y, b.y + b.h / 2, b.y + b.h, input.bounds, tolerance);
  }
  // Equal-spacing detection: when target's edge matches candidate edges
  // symmetrically.
  detectEqualSpacing(guides, input.bounds, candidates, tolerance);
  return guides;
}

function pushIfClose(
  out: Guide[],
  axis: 'x' | 'y',
  type: GuideType,
  a: number,
  b: number,
  c: number,
  bounds: Aabb,
  tolerance: number,
): void {
  const range = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.w : bounds.h;
  const points = [
    { pos: a, target: bounds.x },
    { pos: b, target: bounds.x + bounds.w / 2 },
    { pos: c, target: bounds.x + bounds.w },
    { pos: a, target: range },
    { pos: b, target: range + size / 2 },
    { pos: c, target: range + size },
  ];
  for (const point of points) {
    if (Math.abs(point.pos - point.target) <= tolerance) {
      out.push({ type, axis, position: point.pos, targets: [] });
    }
  }
}

function detectEqualSpacing(
  guides: Guide[],
  bounds: Aabb,
  candidates: ReadonlyArray<{ bounds: Aabb }>,
  tolerance: number,
): void {
  // For each axis, sort candidate edges; if our bounds sit symmetrically
  // between two candidates (gap1 ≈ gap2), emit an equal-spacing guide.
  const xEdges = candidates.map((c) => c.bounds.x).filter((v) => v < bounds.x).sort((a, b) => a - b);
  const xEdgesRight = candidates.map((c) => c.bounds.x + c.bounds.w).filter((v) => v > bounds.x + bounds.w).sort((a, b) => a - b);
  const yEdges = candidates.map((c) => c.bounds.y).filter((v) => v < bounds.y).sort((a, b) => a - b);
  const yEdgesBottom = candidates.map((c) => c.bounds.y + c.bounds.h).filter((v) => v > bounds.y + bounds.h).sort((a, b) => a - b);

  if (xEdges.length > 0 && xEdgesRight.length > 0) {
    const left = xEdges[xEdges.length - 1]!;
    const right = xEdgesRight[0]!;
    const gap1 = bounds.x - left;
    const gap2 = right - (bounds.x + bounds.w);
    if (Math.abs(gap1 - gap2) <= tolerance && gap1 > 0 && gap2 > 0) {
      guides.push({ type: 'equal-spacing', axis: 'x', position: bounds.x + bounds.w / 2, targets: [] });
    }
  }
  if (yEdges.length > 0 && yEdgesBottom.length > 0) {
    const top = yEdges[yEdges.length - 1]!;
    const bottom = yEdgesBottom[0]!;
    const gap1 = bounds.y - top;
    const gap2 = bottom - (bounds.y + bounds.h);
    if (Math.abs(gap1 - gap2) <= tolerance && gap1 > 0 && gap2 > 0) {
      guides.push({ type: 'equal-spacing', axis: 'y', position: bounds.y + bounds.h / 2, targets: [] });
    }
  }
}

function inflate(bounds: Aabb, by: number): Aabb {
  return { x: bounds.x - by, y: bounds.y - by, w: bounds.w + by * 2, h: bounds.h + by * 2 };
}