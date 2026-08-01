/**
 * Selection — immutable set of element ids with Shift-add / Alt-subtract
 * marquee behavior. See docs/development_phases/phase-03 §C.4.
 */

import type { Aabb } from '../renderer/camera.js';
import type { SceneGraph } from '../scene/scene-graph.js';
import type { ULID } from '@domio/schema';

export class Selection {
  private readonly set: Set<ULID>;

  constructor(ids?: Iterable<ULID>) {
    this.set = new Set(ids);
  }

  static empty(): Selection {
    return new Selection();
  }

  static from(ids: Iterable<ULID>): Selection {
    return new Selection(ids);
  }

  add(id: ULID): Selection {
    const next = new Set(this.set);
    next.add(id);
    return new Selection(next);
  }

  remove(id: ULID): Selection {
    const next = new Set(this.set);
    next.delete(id);
    return new Selection(next);
  }

  toggle(id: ULID): Selection {
    return this.set.has(id) ? this.remove(id) : this.add(id);
  }

  clear(): Selection {
    return new Selection();
  }

  has(id: ULID): boolean {
    return this.set.has(id);
  }

  ids(): ULID[] {
    return Array.from(this.set);
  }

  size(): number {
    return this.set.size;
  }

  isEmpty(): boolean {
    return this.set.size === 0;
  }

  /** Returns a normalized serialization. */
  toJSON(): ULID[] {
    return this.ids().sort();
  }
}

export interface MarqueeInput {
  rect: Aabb;
  selection: Selection;
  graph: SceneGraph;
  modifiers?: { shift?: boolean; alt?: boolean };
}

/**
 * Returns the next selection after a marquee gesture. The marquee rect is
 * inclusive of all element bounds; locked/hidden layers are skipped.
 *   `shift`: additive (union with current).
 *   `alt`:   subtractive (remove from current).
 */
export function marqueeSelect(input: MarqueeInput): Selection {
  const { rect, selection, graph, modifiers } = input;
  const hits = graph.spatialIndex().query({
    bounds: rect,
    skip: (item) => {
      const node = graph.byId(item.id);
      if (!node || node.kind !== 'element') return true;
      const element = node.ref as { locked?: boolean; hidden?: boolean };
      return element.hidden === true || element.locked === true;
    },
  });
  const hit = idsFromHits(hits);
  if (modifiers?.alt) {
    let next = selection;
    for (const id of hit) next = next.remove(id);
    return next;
  }
  if (modifiers?.shift) {
    let next = selection;
    for (const id of hit) next = next.add(id);
    return next;
  }
  return Selection.from(hit);
}

function idsFromHits(items: ReadonlyArray<{ id: string }>): ULID[] {
  return items.map((item) => item.id as ULID);
}