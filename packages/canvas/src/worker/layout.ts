/**
 * Layout worker — entry point that runs auto-layout then constraints and
 * returns the resolved transforms. See docs/development_phases/phase-03
 * §B.3. Real production runs in a `Worker`; the MVP API is synchronous so
 * tests are deterministic and the editor can run layout inline.
 */

import type { AutoLayoutLayer, Element, Transform2D } from '@domio/schema';
import { autoLayout } from './auto-layout.js';
import { applyConstraints } from './constraints.js';

export interface LayoutRequest {
  parent: AutoLayoutLayer;
  children: Array<{ element: Element; intrinsicSize: { w: number; h: number } }>;
  parentPrev?: { x: number; y: number; w: number; h: number };
}

export interface LayoutResult {
  transforms: Map<string, Transform2D>;
  parentSize: { w: number; h: number };
}

export function runLayout(req: LayoutRequest): LayoutResult {
  const auto = autoLayout(req);
  if (!req.parentPrev) return auto;
  const out = new Map<string, Transform2D>();
  for (const [id, transform] of auto.transforms) {
    const child = req.children.find((c) => c.element.id === id);
    if (!child) {
      out.set(id, transform);
      continue;
    }
    const constraints = child.element.constraints;
    if (constraints) {
      out.set(
        id,
        applyConstraints({
          parent: {
            x: req.parent.transform?.x ?? 0,
            y: req.parent.transform?.y ?? 0,
            w: req.parent.transform?.w ?? 0,
            h: req.parent.transform?.h ?? 0,
          },
          parentPrev: req.parentPrev,
          child: transform,
          constraints,
        }),
      );
    } else {
      out.set(id, transform);
    }
  }
  return { transforms: out, parentSize: auto.parentSize };
}