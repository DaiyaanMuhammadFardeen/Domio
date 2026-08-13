/**
 * Frames — viewport, scroll bounds, clip behavior. See
 * docs/development_phases/phase-03 §C.6. Frames can be nested with
 * `clipContent`; `Cmd+Alt+Up` selects parent.
 */

import type { DeckDocument, Element, FrameLayer, ULID } from '@domio/schema';

export interface FrameContext {
  frame: FrameLayer;
  children: Element[];
  parent: FrameLayer | null;
}

/**
 * Returns the deepest frame ancestor of the given element.
 */
export function parentFrame(doc: DeckDocument, id: ULID): FrameLayer | null {
  let current = findElement(doc, id);
  while (current && current.parentId) {
    const parent = findElement(doc, current.parentId);
    if (!parent) return null;
    if (parent.type === 'frame') return parent;
    current = parent;
  }
  return null;
}

export function frameContext(doc: DeckDocument, id: ULID): FrameContext | null {
  const element = findElement(doc, id);
  if (!element) return null;
  const frame = element.type === 'frame' ? element : parentFrame(doc, id);
  if (!frame) return null;
  const children: Element[] = [];
  for (const slide of doc.slides) {
    for (const el of slide.elements) {
      if (el.parentId === frame.id) children.push(el);
    }
  }
  return { frame, children, parent: parentFrame(doc, frame.id) };
}

/**
 * Nested frame clipping: returns a render-time `ClipCommand` for the
 * frame's content bounds.
 */
export interface FrameClip {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function frameClip(frame: FrameLayer): FrameClip | null {
  if (!frame.clipContent) return null;
  const t = frame.transform;
  if (!t) return null;
  return { x: t.x, y: t.y, w: t.w, h: t.h };
}

function findElement(doc: DeckDocument, id: ULID): Element | null {
  for (const slide of doc.slides) {
    const found = slide.elements.find((el) => el.id === id);
    if (found) return found;
  }
  return null;
}
