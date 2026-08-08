/**
 * 3-way diff algorithm for merge requests (Phase 18 W2).
 *
 * Ported from services/control-plane/src/branch/diff.ts and extended with:
 *  - Data-binding diffs (elements.binding)
 *  - Granularity levels: slide | element | data_binding
 *  - Conflict detection (all three disagree → conflict)
 *
 * Algorithm:
 *   1. Index slides by semanticId across base, source, target.
 *   2. Slides only in source → added; only in target → removed.
 *   3. Slides in both → diff element trees by JSON-pointer paths.
 *   4. For each element path: if base==source!=target, or base!=source==target → non-conflict change.
 *      If base!=source && base!=target && source!=target → conflict.
 *   5. Binding diffs: compare elements.binding at slide level.
 *   6. Granularity levels control output detail.
 */

import type {
  DiffSnapshot,
  DeckSnapshot,
  SlideSnapshot,
  ElementSnapshot,
  SlideDiffEntry,
  ElementDiffEntry,
  BindingDiffEntry,
  ChangeType,
  SlideDiffLevel,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComputeDiffInput {
  readonly base: DiffSnapshot;
  readonly source: DiffSnapshot;
  readonly target: DiffSnapshot;
  readonly level?: SlideDiffLevel;
}

export interface DiffResult {
  readonly slide_diffs: SlideDiffEntry[];
  readonly binding_diffs: BindingDiffEntry[];
  readonly has_conflicts: boolean;
  readonly conflicting_slide_ids: string[];
}

/**
 * Compute a 3-way diff between source and target, relative to base.
 *
 * When level='slide', only slide-level changes are returned.
 * When level='element', element-level diffs are included.
 * When level='data_binding', binding diffs are included.
 */
export function computeDiff(input: ComputeDiffInput): DiffResult {
  const level = input.level ?? 'slide';
  const baseSlides = indexBySemanticId(input.base.deck);
  const sourceSlides = indexBySemanticId(input.source.deck);
  const targetSlides = indexBySemanticId(input.target.deck);

  const slideDiffs: SlideDiffEntry[] = [];
  const bindingDiffs: BindingDiffEntry[] = [];
  let hasConflicts = false;
  const conflictingSlideIds: string[] = [];

  const allSlideIds = new Set<string>([
    ...baseSlides.order,
    ...sourceSlides.order,
    ...targetSlides.order,
  ]);

  for (const slideId of allSlideIds) {
    const baseSlide = baseSlides.byId.get(slideId) ?? null;
    const sourceSlide = sourceSlides.byId.get(slideId) ?? null;
    const targetSlide = targetSlides.byId.get(slideId) ?? null;

    // Determine slide-level change type
    const changeType = classifySlide(baseSlide, sourceSlide, targetSlide);
    if (changeType === null) continue; // unchanged

    const before = baseSlide ? snapshotToPlain(baseSlide) : null;
    const after = sourceSlide ? snapshotToPlain(sourceSlide) : null;

    const elementDiffs: ElementDiffEntry[] = [];
    const slideHasConflicts = diffSlideElements(
      baseSlide, sourceSlide, targetSlide,
      level, elementDiffs,
    );

    // Slide-level conflict: all three differ and none are equal
    let isSlideLevelConflict = false;
    if (baseSlide && sourceSlide && targetSlide) {
      const baseSourceEqual = slidesEqual(baseSlide, sourceSlide);
      const baseTargetEqual = slidesEqual(baseSlide, targetSlide);
      isSlideLevelConflict = !baseSourceEqual && !baseTargetEqual;
    }

    // Binding diffs (only when level is 'data_binding' or when bindings changed)
    if (level === 'data_binding' || level === 'element') {
      diffSlideBindings(baseSlide, sourceSlide, targetSlide, bindingDiffs);
    }

    if (slideHasConflicts || isSlideLevelConflict) {
      hasConflicts = true;
      conflictingSlideIds.push(slideId);
    }

    slideDiffs.push({
      slide_id: slideId,
      change_type: changeType,
      before,
      after,
      element_diffs: level === 'slide' ? [] : elementDiffs,
    });
  }

  return {
    slide_diffs: slideDiffs,
    binding_diffs: bindingDiffs,
    has_conflicts: hasConflicts,
    conflicting_slide_ids: conflictingSlideIds,
  };
}

/**
 * Determine if source descends from target head (fast-forward).
 * In the absence of a DAG, we approximate: if base == target version
 * and source has changes, it's a fast-forward.
 */
export function isFastForward(
  base: DiffSnapshot,
  source: DiffSnapshot,
  target: DiffSnapshot,
): boolean {
  // Fast-forward when source version is ahead of target and base equals target
  return base.version_id === target.version_id && base.version_id !== source.version_id;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SlideIndex {
  byId: Map<string, SlideSnapshot>;
  order: string[];
}

function indexBySemanticId(deck: DeckSnapshot): SlideIndex {
  const byId = new Map<string, SlideSnapshot>();
  const order: string[] = [];
  for (const slide of deck.slides) {
    byId.set(slide.id, slide);
    order.push(slide.id);
  }
  return { byId, order };
}

function classifySlide(
  base: SlideSnapshot | null,
  source: SlideSnapshot | null,
  target: SlideSnapshot | null,
): ChangeType | null {
  if (!base && source && !target) return 'added';
  if (!base && !source && target) return 'removed';
  if (base && source && !target) return 'removed';
  if (base && !source && target) return 'removed';
  if (!base && source && target) return 'added';
  if (base && source && target) {
    if (slidesEqual(base, source) && slidesEqual(base, target)) return null;
    return 'modified';
  }
  return null;
}

function slidesEqual(a: SlideSnapshot, b: SlideSnapshot): boolean {
  if (a.title !== b.title) return false;
  if (a.notes !== b.notes) return false;
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i++) {
    if (!deepEqual(a.elements[i]!, b.elements[i]!)) return false;
  }
  return true;
}

function diffSlideElements(
  base: SlideSnapshot | null,
  source: SlideSnapshot | null,
  target: SlideSnapshot | null,
  level: SlideDiffLevel,
  out: ElementDiffEntry[],
): boolean {
  if (level === 'slide') return false;
  if (!source || !target) return false;

  const baseElems = new Map<string, ElementSnapshot>();
  if (base) for (const e of base.elements) baseElems.set(e.id, e);

  const sourceElems = new Map<string, ElementSnapshot>();
  for (const e of source.elements) sourceElems.set(e.id, e);

  const targetElems = new Map<string, ElementSnapshot>();
  for (const e of target.elements) targetElems.set(e.id, e);

  let hasConflicts = false;
  const allIds = new Set<string>([
    ...baseElems.keys(),
    ...sourceElems.keys(),
    ...targetElems.keys(),
  ]);

  for (const elemId of allIds) {
    const baseElem = baseElems.get(elemId) ?? null;
    const sourceElem = sourceElems.get(elemId) ?? null;
    const targetElem = targetElems.get(elemId) ?? null;

    if (!baseElem && sourceElem && !targetElem) {
      // Added in source only
      out.push({
        element_id: elemId,
        path: `elements[${elemId}]`,
        change_type: 'added',
        source_value: sourceElem,
        target_value: null,
        base_value: null,
        is_conflict: false,
      });
      continue;
    }

    if (baseElem && sourceElem && !targetElem) {
      // Removed in target
      out.push({
        element_id: elemId,
        path: `elements[${elemId}]`,
        change_type: 'removed',
        source_value: sourceElem,
        target_value: null,
        base_value: baseElem,
        is_conflict: false,
      });
      continue;
    }

    if (!baseElem && !sourceElem && targetElem) {
      // Added in target only (from merge perspective, source removed it)
      out.push({
        element_id: elemId,
        path: `elements[${elemId}]`,
        change_type: 'added',
        source_value: null,
        target_value: targetElem,
        base_value: null,
        is_conflict: false,
      });
      continue;
    }

    if (baseElem && sourceElem && targetElem) {
      // Present on all three sides — walk property paths
      walkJsonPaths(
        baseElem, sourceElem, targetElem,
        elemId, level, out, [],
      );
    }
  }

  // Check if any diff has is_conflict
  for (const d of out) {
    if (d.is_conflict) {
      hasConflicts = true;
      break;
    }
  }

  return hasConflicts;
}

function diffSlideBindings(
  base: SlideSnapshot | null,
  source: SlideSnapshot | null,
  target: SlideSnapshot | null,
  out: BindingDiffEntry[],
): void {
  const baseBindings = extractBindings(base);
  const sourceBindings = extractBindings(source);
  const targetBindings = extractBindings(target);

  const allIds = new Set<string>([
    ...baseBindings.keys(),
    ...sourceBindings.keys(),
    ...targetBindings.keys(),
  ]);

  for (const bindingId of allIds) {
    const baseVal = baseBindings.get(bindingId) ?? null;
    const sourceVal = sourceBindings.get(bindingId) ?? null;
    const targetVal = targetBindings.get(bindingId) ?? null;

    const changeType = classifyBinding(baseVal, sourceVal, targetVal);
    if (changeType === null) continue;

    out.push({
      binding_id: bindingId,
      change_type: changeType,
      before: baseVal,
      after: sourceVal ?? targetVal,
    });
  }
}

function extractBindings(slide: SlideSnapshot | null): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!slide) return map;
  for (const elem of slide.elements) {
    if (elem.binding && typeof elem.binding === 'object') {
      map.set(elem.id, elem.binding as Record<string, unknown>);
    }
  }
  return map;
}

function classifyBinding(
  base: Record<string, unknown> | null,
  source: Record<string, unknown> | null,
  target: Record<string, unknown> | null,
): ChangeType | null {
  if (!base && source) return 'added';
  if (base && !source) return 'removed';
  if (base && source && !deepEqual(base, source)) return 'modified';
  if (base && source && deepEqual(base, source) && target && !deepEqual(base, target)) return 'modified';
  return null;
}

function walkJsonPaths(
  baseElem: ElementSnapshot,
  sourceElem: ElementSnapshot,
  targetElem: ElementSnapshot,
  elemId: string,
  level: SlideDiffLevel,
  out: ElementDiffEntry[],
  pathPrefix: string[],
  depth: number = 0,
): void {
  if (depth > 16) return;

  // Skip binding paths at element level (only at data_binding level)
  if (level === 'element' && pathPrefix[0] === 'binding') return;

  const baseObj = baseElem as unknown as Record<string, unknown>;
  const sourceObj = sourceElem as unknown as Record<string, unknown>;
  const targetObj = targetElem as unknown as Record<string, unknown>;

  const keys = new Set<string>([
    ...Object.keys(baseObj),
    ...Object.keys(sourceObj),
    ...Object.keys(targetObj),
  ]);

  // Skip metadata keys for element-level diff
  const skipKeys = new Set(['id', 'type']);

  for (const key of keys) {
    if (skipKeys.has(key)) continue;
    // At element level, skip binding (handled separately)
    if (level === 'element' && key === 'binding') continue;

    const baseVal = baseObj[key];
    const sourceVal = sourceObj[key];
    const targetVal = targetObj[key];

    if (baseVal === sourceVal && baseVal === targetVal) continue;

    const currentPath = [...pathPrefix, key];
    const fullPath = `elements[${elemId}].${currentPath.join('.')}`;

    if (!isObject(baseVal) || !isObject(sourceVal) || !isObject(targetVal)) {
      // Leaf value — check for conflict
      const equalBaseSource = deepEqual(baseVal, sourceVal);
      const equalBaseTarget = deepEqual(baseVal, targetVal);
      const isConflict = !equalBaseSource && !equalBaseTarget;

      if (isConflict) {
        out.push({
          element_id: elemId,
          path: fullPath,
          change_type: 'modified',
          source_value: sourceVal,
          target_value: targetVal,
          base_value: baseVal,
          is_conflict: true,
        });
      } else {
        out.push({
          element_id: elemId,
          path: fullPath,
          change_type: 'modified',
          source_value: sourceVal,
          target_value: targetVal,
          base_value: baseVal,
          is_conflict: false,
        });
      }
      continue;
    }

    // Object — recurse
    walkJsonPaths(
      baseVal as ElementSnapshot,
      sourceVal as ElementSnapshot,
      targetVal as ElementSnapshot,
      elemId,
      level,
      out,
      currentPath,
      depth + 1,
    );
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function snapshotToPlain(slide: SlideSnapshot): Record<string, unknown> {
  return {
    id: slide.id,
    title: slide.title,
    notes: slide.notes,
    elements: slide.elements.map(e => ({
      id: e.id,
      type: e.type,
      binding: e.binding,
      style: e.style,
    })),
  };
}
