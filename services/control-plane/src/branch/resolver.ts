/**
 * Conflict resolver — Phase 05 B.2.
 *
 * Given a {@link DiffSummary} and a {@link ResolutionStrategy}, the
 * resolver mutates an in-memory deck document into the "merged"
 * shape.  The output is the working tree the editor renders in the
 * 3-pane diff view; the actual merge commit happens in {@link merge.ts}
 * after the user accepts the resolved tree.
 *
 * Resolution semantics:
 *
 *   - `theirs`  → pick the source value verbatim.
 *   - `ours`    → keep the target value.
 *   - `manual`  → use the per-path resolution map (`path → chosen
 *                 value`) and fall back to `theirs` for anything not
 *                 present in the map.  Manual resolutions are scoped
 *                 to the exact `DiffConflict.path`.
 *
 * The function never modifies its inputs and always returns a new
 * `DeckDocument`.  The merged revision counter is returned alongside
 * so the merge-commit path can advance the branch head.
 */

import type { DeckDocument, Element } from '@domio/schema';

import type { DiffConflict, DiffElementChange, DiffSummary } from './diff.js';

export type { DiffConflict, DiffElementChange, DiffSummary };

export type ResolutionStrategy = 'theirs' | 'ours' | 'manual';

export interface ResolveRequest {
  /** Strategy to apply to conflicts. */
  strategy: ResolutionStrategy;
  /**
   * Per-path manual resolutions.  Keys are JSON Pointer-style paths
   * (matching {@link DiffConflict.path}).  Required when
   * `strategy === 'manual'`; ignored otherwise.
   */
  resolutions?: Record<string, unknown>;
  /** Resulting revision after applying the strategy. */
  resolvedAtRevision: number;
}

export interface ResolveResult {
  deck: DeckDocument;
  /** Conflicts the resolver was unable to settle.  Empty for
   *  theirs/ours/manual with full map. */
  unresolved: DiffConflict[];
  /** The strategy actually applied (manual resolutions may demote to
   *  theirs when paths are missing). */
  applied: ResolutionStrategy;
}

export class MissingManualResolutionsError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Manual resolution required for ${missing.length} conflict(s): ${missing.join(', ')}.`,
    );
    this.name = 'MissingManualResolutionsError';
  }
}

/**
 * Apply a {@link ResolveRequest} to a target deck document.  The
 * `source` argument is used only for `theirs`; for `ours` the target
 * is returned largely untouched (only adding the new revision number
 * where conflicts had source-side additions the target wants to
 * preserve).
 */
export function resolveConflicts(args: {
  target: DeckDocument;
  source: DeckDocument;
  diff: DiffSummary;
  request: ResolveRequest;
}): ResolveResult {
  const { diff, request, target, source } = args;
  const unresolved: DiffConflict[] = [];
  const resolutions = request.resolutions ?? {};
  let applied: ResolutionStrategy = request.strategy;

  if (request.strategy === 'manual') {
    const missing = diff.conflicts
      .map((c) => c.path)
      .filter((p) => !(p in resolutions));
    if (missing.length > 0) {
      throw new MissingManualResolutionsError(missing);
    }
  }

  const merged = cloneShallow(target);

  // Apply slide-level additions / removals from source.
  for (const slideRef of diff.slides.added) {
    const sourceSlide = source.slides.find((s) => (s.id as string) === slideRef.slideId);
    if (sourceSlide) {
      merged.slides = [...merged.slides, structuredClone(sourceSlide)];
    }
  }
  for (const slideRef of diff.slides.removed) {
    merged.slides = merged.slides.filter((s) => (s.id as string) !== slideRef.slideId);
  }

  // Apply per-element changes.
  for (const change of diff.elements) {
    applyElementChange(merged, source, change, request.strategy, resolutions);
  }

  // Track conflicts that the chosen strategy couldn't resolve.
  // `theirs`/`ours` apply globally and clear all conflicts; only a
  // manual strategy that omits a path leaves a conflict entry.
  for (const conflict of diff.conflicts) {
    if (request.strategy === 'theirs' || request.strategy === 'ours') {
      // Strategy resolved it globally; nothing on the unresolved list.
      continue;
    }
    if (!(conflict.path in resolutions)) {
      unresolved.push(conflict);
      applied = 'theirs';
    }
  }

  return { deck: merged, unresolved, applied };
}

function applyElementChange(
  merged: DeckDocument,
  source: DeckDocument,
  change: DiffElementChange,
  strategy: ResolutionStrategy,
  resolutions: Record<string, unknown>,
): void {
  // The path has shape `elements[<id>]...` — parse out the leading
  // element id so we can find the element on the target.
  const match = /^elements\[([^\]]+)\](\..*)?$/.exec(change.path);
  if (!match) return;
  const elementId = match[1]!;
  const subPath = match[2]?.slice(1) ?? '';
  const slide = merged.slides.find((s) =>
    s.elements.some((e) => (e.id as string) === elementId),
  );
  const sourceSlide = source.slides.find((s) =>
    s.elements.some((e) => (e.id as string) === elementId),
  );
  if (!slide || !sourceSlide) return;
  const targetElemIndex = slide.elements.findIndex(
    (e) => (e.id as string) === elementId,
  );
  const sourceElem = sourceSlide.elements.find(
    (e) => (e.id as string) === elementId,
  );
  if (change.kind === 'added') {
    if (sourceElem && !slide.elements.some((e) => (e.id as string) === elementId)) {
      slide.elements = [...slide.elements, structuredClone(sourceElem)];
    }
    return;
  }
  if (change.kind === 'removed') {
    slide.elements = slide.elements.filter((e) => (e.id as string) !== elementId);
    return;
  }
  // `modified`
  if (targetElemIndex < 0 || !sourceElem) return;
  let chosen: unknown;
  if (strategy === 'theirs') chosen = change.sourceValue;
  else if (strategy === 'ours') chosen = change.targetValue;
  else chosen = resolutions[change.path] ?? change.sourceValue;
  if (subPath === '') {
    slide.elements = [
      ...slide.elements.slice(0, targetElemIndex),
      structuredClone(sourceElem),
      ...slide.elements.slice(targetElemIndex + 1),
    ];
    return;
  }
  // Apply per-property change via JSON Pointer-style copy.
  slide.elements = slide.elements.map((e, i) => {
    if (i !== targetElemIndex) return e;
    const updated = structuredClone(e) as Element;
    setPath(updated as unknown as Record<string, unknown>, subPath, chosen);
    return updated;
  });
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    const next = cursor[key];
    if (typeof next !== 'object' || next === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

function cloneShallow(deck: DeckDocument): DeckDocument {
  // structuredClone preserves nested DeckDocument / Slide / Element
  // shapes exactly.  We deep-copy for safety; the working tree is
  // small (≤ 200 slides).
  return structuredClone(deck);
}
