/**
 * Lock / hide toggles. See docs/development_phases/phase-03 §C.4: hidden
 * layers are excluded from render and bounds queries but persist in the
 * scene graph (per docs/editor-canvas.md §1 Feature 4).
 */

import type { DeckDocument, ULID } from '@domio/schema';

export type LockHideFlag = 'locked' | 'hidden';

export function toggleFlag(
  doc: DeckDocument,
  id: ULID,
  flag: LockHideFlag,
): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) => {
        if (element.id !== id) return element;
        if (flag === 'locked') {
          return { ...element, locked: !element.locked };
        }
        return { ...element, hidden: !element.hidden };
      }),
    })),
  };
}

export function setFlag(
  doc: DeckDocument,
  id: ULID,
  flag: LockHideFlag,
  value: boolean,
): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) => {
        if (element.id !== id) return element;
        return { ...element, [flag]: value };
      }),
    })),
  };
}