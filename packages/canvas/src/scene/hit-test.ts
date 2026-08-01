/**
 * Hit testing — top-most (by z) element whose bounds contain the world
 * point. Respects locked/hidden layers per docs/development_phases/phase-03
 * §B.4 acceptance: "click on nested frame, group, locked layer, hidden
 * layer".
 */

import type { Element, ULID } from '@domio/schema';
import { SpatialIndex } from './spatial-index.js';
import type { SceneGraph } from './scene-graph.js';

export interface HitTestOptions {
  /** Skip locked layers. */
  skipLocked?: boolean;
  /** Skip hidden layers. */
  skipHidden?: boolean;
  /** Skip layers whose type matches one of these. */
  skipTypes?: ReadonlyArray<Element['type']>;
}

export interface HitTestResult {
  id: ULID;
  element: Element;
}

export function hitTest(
  graph: SceneGraph,
  worldX: number,
  worldY: number,
  options: HitTestOptions = {},
): HitTestResult | null {
  const index: SpatialIndex = graph.spatialIndex();
  const hit = index.hitTest(worldX, worldY, (item) => {
    const node = graph.byId(item.id);
    if (!node || node.kind !== 'element') return false;
    const element = node.ref as Element;
    if (options.skipLocked && element.locked) return true;
    if (options.skipHidden && element.hidden) return true;
    if (options.skipTypes?.includes(element.type)) return true;
    return false;
  });
  if (!hit) return null;
  const node = graph.byId(hit.id);
  if (!node || node.kind !== 'element') return null;
  return { id: node.id as ULID, element: node.ref as Element };
}

/** Returns all elements whose bounds contain the world point, top-down. */
export function hitTestAll(
  graph: SceneGraph,
  worldX: number,
  worldY: number,
  options: HitTestOptions = {},
): HitTestResult[] {
  const index = graph.spatialIndex();
  const candidates = index.query({
    bounds: { x: worldX - 0.5, y: worldY - 0.5, w: 1, h: 1 },
    skip: (item) => {
      const node = graph.byId(item.id);
      if (!node || node.kind !== 'element') return true;
      const element = node.ref as Element;
      if (options.skipLocked && element.locked) return true;
      if (options.skipHidden && element.hidden) return true;
      if (options.skipTypes?.includes(element.type)) return true;
      return false;
    },
  });
  return candidates
    .filter((item) => {
      const node = graph.byId(item.id);
      if (!node) return false;
      const b = item.bounds;
      return worldX >= b.x && worldX <= b.x + b.w && worldY >= b.y && worldY <= b.y + b.h;
    })
    .map((item) => {
      const node = graph.byId(item.id)!;
      return { id: node.id as ULID, element: node.ref as Element };
    });
}