/**
 * 3-way diff algorithm tests (Phase 18 W2).
 *
 * Tests at all 3 granularity levels (slide, element, data_binding),
 * including conflict detection, fast-forward detection, and binding diffs.
 */

import { describe, it, expect } from 'vitest';
import { computeDiff, isFastForward } from './diff.js';
import type { DeckSnapshot, DiffSnapshot } from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlide(id: string, title: string, elements: Array<{ id: string; type: string; style?: Record<string, unknown>; binding?: Record<string, unknown> | null }> = []) {
  return {
    id,
    semantic_id: id,
    title,
    notes: '',
    elements: elements.map(e => ({
      id: e.id,
      type: e.type,
      binding: e.binding ?? null,
      style: e.style ?? {},
    })),
  };
}

function makeDeck(slides: ReturnType<typeof makeSlide>[]): DeckSnapshot {
  return { slides };
}

function snapshot(versionId: string, deck: DeckSnapshot): DiffSnapshot {
  return { branch_id: 'branch', version_id: versionId, deck };
}

// ---------------------------------------------------------------------------
// Slide-level diffs
// ---------------------------------------------------------------------------

describe('computeDiff — slide level', () => {
  it('returns empty when all snapshots are identical', () => {
    const deck = makeDeck([makeSlide('s1', 'Title A')]);
    const result = computeDiff({
      base: snapshot('v1', deck),
      source: snapshot('v2', deck),
      target: snapshot('v3', deck),
    });
    expect(result.slide_diffs).toHaveLength(0);
    expect(result.binding_diffs).toHaveLength(0);
    expect(result.has_conflicts).toBe(false);
  });

  it('detects slide added in source', () => {
    const base = makeDeck([]);
    const source = makeDeck([makeSlide('s1', 'New Slide')]);
    const target = makeDeck([]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
    });
    expect(result.slide_diffs).toHaveLength(1);
    expect(result.slide_diffs[0]!.change_type).toBe('added');
    expect(result.slide_diffs[0]!.slide_id).toBe('s1');
  });

  it('detects slide removed in source', () => {
    const base = makeDeck([makeSlide('s1', 'Title A')]);
    const source = makeDeck([]);
    const target = makeDeck([makeSlide('s1', 'Title A')]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
    });
    expect(result.slide_diffs).toHaveLength(1);
    expect(result.slide_diffs[0]!.change_type).toBe('removed');
  });

  it('detects slide modified', () => {
    const base = makeDeck([makeSlide('s1', 'Title A')]);
    const source = makeDeck([makeSlide('s1', 'Title B')]);
    const target = makeDeck([makeSlide('s1', 'Title A')]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
    });
    expect(result.slide_diffs).toHaveLength(1);
    expect(result.slide_diffs[0]!.change_type).toBe('modified');
  });

  it('detects conflicting slide modifications', () => {
    const base = makeDeck([makeSlide('s1', 'Title A')]);
    const source = makeDeck([makeSlide('s1', 'Title B')]);
    const target = makeDeck([makeSlide('s1', 'Title C')]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
    });
    expect(result.slide_diffs).toHaveLength(1);
    expect(result.slide_diffs[0]!.change_type).toBe('modified');
    expect(result.has_conflicts).toBe(true);
    expect(result.conflicting_slide_ids).toContain('s1');
  });

  it('slide level returns empty element_diffs', () => {
    const base = makeDeck([makeSlide('s1', 'Title A')]);
    const source = makeDeck([makeSlide('s1', 'Title B')]);
    const target = makeDeck([makeSlide('s1', 'Title A')]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'slide',
    });
    expect(result.slide_diffs[0]!.element_diffs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Element-level diffs
// ---------------------------------------------------------------------------

describe('computeDiff — element level', () => {
  it('detects element added in source', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [])]);
    const source = makeDeck([makeSlide('s1', 'S1', [{ id: 'e1', type: 'text' }])]);
    const target = makeDeck([makeSlide('s1', 'S1', [])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'element',
    });
    expect(result.slide_diffs).toHaveLength(1);
    expect(result.slide_diffs[0]!.element_diffs.length).toBeGreaterThan(0);
    expect(result.slide_diffs[0]!.element_diffs[0]!.change_type).toBe('added');
  });

  it('detects element modified with conflict', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 0 } },
    ])]);
    const source = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 10 } },
    ])]);
    const target = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 20 } },
    ])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'element',
    });
    expect(result.has_conflicts).toBe(true);
    expect(result.slide_diffs[0]!.element_diffs[0]!.is_conflict).toBe(true);
  });

  it('detects non-conflicting element change', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 0 } },
    ])]);
    const source = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 10 } },
    ])]);
    const target = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', style: { x: 0 } },
    ])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'element',
    });
    expect(result.has_conflicts).toBe(false);
    expect(result.slide_diffs[0]!.element_diffs[0]!.is_conflict).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Data-binding diffs
// ---------------------------------------------------------------------------

describe('computeDiff — data_binding level', () => {
  it('detects binding added in source', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: null },
    ])]);
    const source = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const target = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: null },
    ])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'data_binding',
    });
    expect(result.binding_diffs.length).toBeGreaterThan(0);
    expect(result.binding_diffs[0]!.change_type).toBe('added');
  });

  it('detects binding modified', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const source = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'profit' } },
    ])]);
    const target = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'data_binding',
    });
    expect(result.binding_diffs.length).toBeGreaterThan(0);
    expect(result.binding_diffs[0]!.change_type).toBe('modified');
  });

  it('no binding diffs when bindings unchanged', () => {
    const base = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const source = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const target = makeDeck([makeSlide('s1', 'S1', [
      { id: 'e1', type: 'text', binding: { field: 'revenue' } },
    ])]);
    const result = computeDiff({
      base: snapshot('v1', base),
      source: snapshot('v2', source),
      target: snapshot('v3', target),
      level: 'data_binding',
    });
    expect(result.binding_diffs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isFastForward
// ---------------------------------------------------------------------------

describe('isFastForward', () => {
  it('returns true when base equals target and differs from source', () => {
    const deck = makeDeck([makeSlide('s1', 'S1')]);
    expect(isFastForward(
      snapshot('v1', deck),
      snapshot('v2', deck),
      snapshot('v1', deck),
    )).toBe(true);
  });

  it('returns false when base differs from target', () => {
    const deck = makeDeck([makeSlide('s1', 'S1')]);
    expect(isFastForward(
      snapshot('v1', deck),
      snapshot('v2', deck),
      snapshot('v3', deck),
    )).toBe(false);
  });

  it('returns false when base equals source', () => {
    const deck = makeDeck([makeSlide('s1', 'S1')]);
    expect(isFastForward(
      snapshot('v1', deck),
      snapshot('v1', deck),
      snapshot('v1', deck),
    )).toBe(false);
  });
});
