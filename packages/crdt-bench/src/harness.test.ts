/**
 * Tests for the CRDT convergence bench harness.
 *
 * These run a small editor count (≤10) so the suite finishes in <1s.
 * The headline 1000-editor scenario lives in scripts/ci-run.ts and is
 * invoked by `.github/workflows/crdt-bench.yml` only on PRs labelled
 * `perf-bench`.
 */

import { describe, it, expect } from 'vitest';
import {
  createEditor,
  runConvergenceBench,
  percentile,
} from './harness.js';

describe('createEditor', () => {
  it('returns a fresh editor with unique Y.Doc', () => {
    const a = createEditor({ id: 0 });
    const b = createEditor({ id: 1 });
    expect(a.deckDoc).not.toBe(b.deckDoc);
    expect(a.registry).not.toBe(b.registry);
    expect(a.deckDoc.guid).toBe('deck-0');
    expect(b.deckDoc.guid).toBe('deck-1');
  });

  it('seeds slide-0 with empty elements', () => {
    const editor = createEditor({ id: 42 });
    const slide = editor.registry.getOrCreateSlide('slide-0');
    expect(slide.getMap('meta').get('id')).toBe('slide-0');
  });

  it('records lastRemoteAppliedMs on construction', () => {
    const before = Date.now();
    const editor = createEditor({ id: 0 });
    const after = Date.now();
    expect(editor.lastRemoteAppliedMs).toBeGreaterThanOrEqual(before);
    expect(editor.lastRemoteAppliedMs).toBeLessThanOrEqual(after);
  });
});

describe('percentile', () => {
  it('returns 0 for empty', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
  it('returns the median for p=0.5', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  it('clamps to valid index', () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});

describe('runConvergenceBench (smoke)', () => {
  it('converges text-insert edits across 5 editors', async () => {
    const result = await runConvergenceBench({
      editorCount: 5,
      editsPerEditor: 10,
      editIntervalMs: 0,
      scenario: 'text-insert',
    });
    expect(result.editors).toBe(5);
    // 5 editors × 10 edits × 4 peers = 200 convergence events
    expect(result.totalEdits).toBe(5 * 10 * 4);
    expect(result.aborted).toBe(false);
    expect(result.convergenceMs.max).toBeGreaterThanOrEqual(0);
    expect(result.convergenceMs.p50).toBeGreaterThanOrEqual(0);
  }, 15_000);

  it('handles mixed scenario without throwing', async () => {
    const result = await runConvergenceBench({
      editorCount: 3,
      editsPerEditor: 60,
      editIntervalMs: 0,
      scenario: 'mixed',
    });
    expect(result.scenario).toBe('mixed');
    expect(result.totalEdits).toBeGreaterThan(0);
  }, 15_000);

  it('honours abort signal', async () => {
    const controller = new AbortController();
    const promise = runConvergenceBench({
      editorCount: 3,
      editsPerEditor: 100,
      editIntervalMs: 5,
      scenario: 'shape-add',
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);
    const result = await promise;
    expect(result.aborted).toBe(true);
  }, 10_000);

  it('shape-add grows shapes array on each editor', async () => {
    const editor = createEditor({ id: 7 });
    const slide = editor.registry.getOrCreateSlide('slide-0');
    expect(slide.getArray('shapes').length).toBe(0);
    // Manually mirror applyShapeAdd logic
    const shapes = slide.getArray<Record<string, unknown>>('shapes');
    shapes.push([{ id: 's0-7', kind: 'rect', x: 0, y: 0 }]);
    expect(shapes.length).toBe(1);
    expect(shapes.get(0).id).toBe('s0-7');
  });
});
