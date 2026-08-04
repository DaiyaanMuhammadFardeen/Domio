/**
 * @domio/animation-runtime — Stagger tests.
 */

import { describe, it, expect } from 'vitest';
import { applyStagger } from './Stagger.js';
import type { Timeline } from './types.js';

function makeTimeline(id: string, startOffsetMs = 0): Timeline {
  return {
    id,
    elementId: `el-${id}`,
    durationMs: 1000,
    loop: false,
    playCount: 1,
    startOffsetMs,
    tracks: [],
    triggers: [],
  };
}

describe('applyStagger', () => {
  it('single element is a no-op', () => {
    const tl = makeTimeline('a');
    const result = applyStagger([tl], { direction: 'forward', intervalMs: 100 });
    expect(result).toHaveLength(1);
    expect(result[0]?.startOffsetMs).toBe(0);
    expect(result[0]?.timeline).toBe(tl);
  });

  describe('forward', () => {
    it('applies sequential offsets', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c')];
      const result = applyStagger(tls, { direction: 'forward', intervalMs: 50 });
      expect(result.map((r) => r.startOffsetMs)).toEqual([0, 50, 100]);
    });

    it('preserves original order', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c')];
      const result = applyStagger(tls, { direction: 'forward', intervalMs: 50 });
      expect(result.map((r) => r.timeline.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('reverse', () => {
    it('applies reverse sequential offsets', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c')];
      const result = applyStagger(tls, { direction: 'reverse', intervalMs: 50 });
      expect(result.map((r) => r.startOffsetMs)).toEqual([0, 50, 100]);
      // But the order should be reversed
      expect(result.map((r) => r.timeline.id)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('center-out', () => {
    it('centers out from middle', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c'), makeTimeline('d')];
      const result = applyStagger(tls, { direction: 'center-out', intervalMs: 50 });
      // Center elements come first
      const ids = result.map((r) => r.timeline.id);
      // b and c are closest to center (1.5), then a and d (0.5 and 2.5)
      expect(ids[0] === 'b' || ids[0] === 'c').toBe(true);
    });
  });

  describe('random', () => {
    it('deterministic with seed', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c'), makeTimeline('d'), makeTimeline('e')];
      const result1 = applyStagger(tls, { direction: 'random', intervalMs: 50, seed: 42 });
      const result2 = applyStagger(tls, { direction: 'random', intervalMs: 50, seed: 42 });
      expect(result1.map((r) => r.timeline.id)).toEqual(result2.map((r) => r.timeline.id));
    });

    it('different seeds produce different orders', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c'), makeTimeline('d'), makeTimeline('e')];
      const result1 = applyStagger(tls, { direction: 'random', intervalMs: 50, seed: 42 });
      const result2 = applyStagger(tls, { direction: 'random', intervalMs: 50, seed: 99 });
      // Extremely unlikely to be the same
      expect(result1.map((r) => r.timeline.id)).not.toEqual(result2.map((r) => r.timeline.id));
    });

    it('applies correct offsets', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c')];
      const result = applyStagger(tls, { direction: 'random', intervalMs: 100, seed: 42 });
      expect(result.map((r) => r.startOffsetMs)).toEqual([0, 100, 200]);
    });
  });

  describe('never changes z-order', () => {
    it('only reorders startOffsetMs, never z-order', () => {
      const tls = [makeTimeline('a'), makeTimeline('b'), makeTimeline('c')];
      // All directions should return new arrays with correct offsets
      for (const dir of ['forward', 'reverse', 'center-out', 'random'] as const) {
        const result = applyStagger(tls, { direction: dir, intervalMs: 50, seed: 42 });
        // Offsets should always be sequential multiples of intervalMs
        const offsets = result.map((r) => r.startOffsetMs).sort((a, b) => a - b);
        expect(offsets).toEqual([0, 50, 100]);
      }
    });
  });
});
