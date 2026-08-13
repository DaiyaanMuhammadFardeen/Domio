/**
 * Group / ungroup. See docs/development_phases/phase-03 §C.4: children's
 * absolute transforms preserved on ungroup; group is itself multi-selectable.
 *
 * Pure functions over the deck document; no mutation. The history engine
 * applies the inverse.
 */

import type { DeckDocument, Element, GroupLayer, Transform2D, ULID } from '@domio/schema';

export interface GroupInput {
  doc: DeckDocument;
  ids: ULID[];
  newGroupId: ULID;
  name?: string;
}

export interface GroupOutput {
  doc: DeckDocument;
  /** Ids of children now parented to the new group. */
  reparented: ULID[];
}

/**
 * Creates a group whose bounds are the union of the children's bounds.
 * Children keep their absolute transforms (no coordinate change).
 */
export function groupElements(input: GroupInput): GroupOutput {
  const { doc, ids, newGroupId, name } = input;
  const idSet = new Set(ids);
  if (ids.length === 0) return { doc, reparented: [] };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const slide of doc.slides) {
    for (const el of slide.elements) {
      if (!idSet.has(el.id)) continue;
      const t = el.transform;
      if (!t) continue;
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x + t.w > maxX) maxX = t.x + t.w;
      if (t.y + t.h > maxY) maxY = t.y + t.h;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const groupTransform: Transform2D = {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    rotation: 0,
    scale: 1,
  };
  const group: GroupLayer = {
    id: newGroupId,
    semanticId: name ?? 'group',
    type: 'group',
    name: name ?? 'Group',
    parentId: ids[0] ? findCommonParent(doc, ids[0]!) : null,
    z: nextZ(doc),
    transform: groupTransform,
  };
  const reparented: ULID[] = [];
  const next = reparentChildren(doc, idSet, newGroupId, reparented);
  // Insert the group near its first child.
  const targetSlideIdx = findSlideIndex(next, ids[0]!);
  if (targetSlideIdx < 0) return { doc, reparented };
  const slide = next.slides[targetSlideIdx]!;
  next.slides[targetSlideIdx] = {
    ...slide,
    elements: [...slide.elements, group],
  };
  return { doc: next, reparented };
}

export interface UngroupInput {
  doc: DeckDocument;
  groupId: ULID;
}

/**
 * Splits a group, restoring children to the group's parent with their
 * absolute transforms intact.
 */
export function ungroupElements(input: UngroupInput): { doc: DeckDocument; ungrouped: ULID[] } {
  const { doc, groupId } = input;
  let next = doc;
  const group = findElement(next, groupId);
  if (!group || group.type !== 'group') return { doc, ungrouped: [] };
  const parentId = group.parentId;
  // Collect the group's immediate children so we can re-parent them back to
  // the group's former parent.
  const childIds = new Set<ULID>();
  for (const slide of next.slides) {
    for (const el of slide.elements) {
      if (el.parentId === groupId) childIds.add(el.id);
    }
  }
  const ungrouped: ULID[] = [];
  next = reparentChildren(doc, childIds, parentId, ungrouped);
  next = removeElement(next, groupId);
  return { doc: next, ungrouped };
}

function reparentChildren(
  doc: DeckDocument,
  newChildIds: Set<ULID>,
  newParentId: ULID | null,
  out: ULID[],
): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) => {
        if (newChildIds.has(element.id)) {
          out.push(element.id);
          return { ...element, parentId: newParentId };
        }
        return element;
      }),
    })),
  };
}

function removeElement(doc: DeckDocument, id: ULID): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.filter((element) => element.id !== id),
    })),
  };
}

function findCommonParent(doc: DeckDocument, id: ULID): ULID | null {
  for (const slide of doc.slides) {
    const element = slide.elements.find((el) => el.id === id);
    if (element) return element.parentId;
  }
  return null;
}

function nextZ(doc: DeckDocument): number {
  let maxZ = 0;
  for (const slide of doc.slides) {
    for (const element of slide.elements) {
      const z = element.z ?? 0;
      if (z > maxZ) maxZ = z;
    }
  }
  return maxZ + 1;
}

function findElement(doc: DeckDocument, id: ULID): Element | null {
  for (const slide of doc.slides) {
    const found = slide.elements.find((el) => el.id === id);
    if (found) return found;
  }
  return null;
}

function findSlideIndex(doc: DeckDocument, id: ULID): number {
  for (let i = 0; i < doc.slides.length; i++) {
    const slide = doc.slides[i]!;
    if (slide.elements.some((el) => el.id === id)) return i;
  }
  return -1;
}
