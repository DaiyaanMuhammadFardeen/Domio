/**
 * @domio/viewer — scroll-linked tests.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveScrollBinding,
  ScrollLinkedError,
  type ScrollBinding,
  type ScrollProgressCache,
} from './scroll-linked.js';

function makeBinding(overrides?: Partial<ScrollBinding>): ScrollBinding {
  return {
    elementId: 'el-1',
    property: 'opacity',
    start: 0,
    end: 1000,
    ...overrides,
  };
}

function createCache(): ScrollProgressCache {
  return new Map();
}

describe('resolveScrollBinding', () => {
  // ── Progress clamping ────────────────────────────────────────
  describe('progress clamping', () => {
    it('clamps progress to 0 when scrollY < start', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 200, end: 800 });
      const result = resolveScrollBinding(binding, 0, cache);
      expect(result).toBe(0);
    });

    it('clamps progress to 0 when scrollY equals start', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 200, end: 800 });
      const result = resolveScrollBinding(binding, 200, cache);
      expect(result).toBe(0);
    });

    it('clamps progress to 1 when scrollY > end', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 200, end: 800 });
      const result = resolveScrollBinding(binding, 1000, cache);
      expect(result).toBe(1);
    });

    it('clamps progress to 1 when scrollY equals end', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 200, end: 800 });
      const result = resolveScrollBinding(binding, 800, cache);
      expect(result).toBe(1);
    });

    it('returns 0.5 at midpoint', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 0, end: 1000 });
      const result = resolveScrollBinding(binding, 500, cache);
      expect(result).toBe(0.5);
    });
  });

  // ── Easing ───────────────────────────────────────────────────
  describe('easing applied', () => {
    it('applies ease-in-out easing', () => {
      const cache = createCache();
      const binding = makeBinding({ easing: 'ease-in-out' });
      const result = resolveScrollBinding(binding, 500, cache);
      // ease-in-out at 0.5 ≈ 0.5 (symmetric), but verify it's a number
      expect(typeof result).toBe('number');
      expect(result as number).toBeGreaterThanOrEqual(0);
      expect(result as number).toBeLessThanOrEqual(1);
    });

    it('applies linear easing (identity)', () => {
      const cache = createCache();
      const binding = makeBinding({ easing: 'linear' });
      const result = resolveScrollBinding(binding, 500, cache);
      expect(result).toBe(0.5);
    });

    it('applies ease-in easing', () => {
      const cache = createCache();
      const binding = makeBinding({ easing: 'ease-in' });
      const result = resolveScrollBinding(binding, 250, cache);
      // ease-in at 0.25 < 0.25 (starts slow)
      expect(result as number).toBeLessThan(0.25);
    });

    it('applies ease-out easing', () => {
      const cache = createCache();
      const binding = makeBinding({ easing: 'ease-out' });
      const result = resolveScrollBinding(binding, 750, cache);
      // ease-out at 0.75 > 0.75 (ends fast)
      expect(result as number).toBeGreaterThan(0.75);
    });

    it('defaults to linear when easing is omitted', () => {
      const cache = createCache();
      const binding = makeBinding();
      const result = resolveScrollBinding(binding, 500, cache);
      expect(result).toBe(0.5);
    });
  });

  // ── Cache ────────────────────────────────────────────────────
  describe('cache behaviour', () => {
    it('returns cached value for same bucket', () => {
      const cache = createCache();
      const binding = makeBinding();
      const result1 = resolveScrollBinding(binding, 500, cache);
      const result2 = resolveScrollBinding(binding, 501, cache);
      // Same bucket → same cached value
      expect(result1).toBe(result2);
    });

    it('stores results in the cache', () => {
      const cache = createCache();
      const binding = makeBinding();
      resolveScrollBinding(binding, 500, cache);
      expect(cache.size).toBe(1);
    });

    it('different buckets produce different cache entries', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 0, end: 3200 });
      // 3200px range, bucket size ≈ 100px
      resolveScrollBinding(binding, 0, cache);   // bucket 0
      resolveScrollBinding(binding, 200, cache);  // bucket 2
      resolveScrollBinding(binding, 400, cache);  // bucket 4
      expect(cache.size).toBe(3);
    });
  });

  // ── Cap ──────────────────────────────────────────────────────
  describe('cap exceeded', () => {
    it('throws when cache exceeds 32 entries', () => {
      const cache = createCache();
      // Fill 32 buckets — use midpoints of each bucket to guarantee uniqueness
      const binding = makeBinding({ start: 0, end: 3200 });
      for (let i = 0; i < 32; i++) {
        resolveScrollBinding(binding, i * 100 + 50, cache); // bucket i for range 0..3200
      }
      expect(cache.size).toBe(32);
      // 33rd entry (maps to bucket 32 = progress=1.0) should throw
      expect(() => {
        resolveScrollBinding(binding, 3200, cache);
      }).toThrow(ScrollLinkedError);
    });

    it('throws with CAP_EXCEEDED code', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 0, end: 3200 });
      for (let i = 0; i < 32; i++) {
        resolveScrollBinding(binding, i * 100 + 50, cache);
      }
      try {
        resolveScrollBinding(binding, 3200, cache);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ScrollLinkedError);
        expect((e as ScrollLinkedError).code).toBe('CAP_EXCEEDED');
      }
    });
  });

  // ── Dependency chain ─────────────────────────────────────────
  describe('dependency chain', () => {
    it('rejects same element with different property in cache', () => {
      const cache = createCache();
      const binding1 = makeBinding({ elementId: 'el-1', property: 'opacity' });
      const binding2 = makeBinding({ elementId: 'el-1', property: 'translateY' });

      resolveScrollBinding(binding1, 500, cache);

      expect(() => {
        resolveScrollBinding(binding2, 500, cache);
      }).toThrow(ScrollLinkedError);
    });

    it('throws with DEPENDENCY_CHAIN code', () => {
      const cache = createCache();
      const binding1 = makeBinding({ elementId: 'el-1', property: 'opacity' });
      const binding2 = makeBinding({ elementId: 'el-1', property: 'transform' });

      resolveScrollBinding(binding1, 500, cache);

      try {
        resolveScrollBinding(binding2, 500, cache);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ScrollLinkedError);
        expect((e as ScrollLinkedError).code).toBe('DEPENDENCY_CHAIN');
      }
    });

    it('allows same property on different elements', () => {
      const cache = createCache();
      const binding1 = makeBinding({ elementId: 'el-1', property: 'opacity' });
      const binding2 = makeBinding({ elementId: 'el-2', property: 'opacity' });

      resolveScrollBinding(binding1, 500, cache);
      expect(() => {
        resolveScrollBinding(binding2, 500, cache);
      }).not.toThrow();
    });
  });

  // ── Bucket math ──────────────────────────────────────────────
  describe('clean bucket math', () => {
    it('maps start to bucket 0', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 100, end: 200 });
      resolveScrollBinding(binding, 100, cache);
      expect(cache.has('el-1:opacity:0')).toBe(true);
    });

    it('maps end to bucket 32', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 0, end: 1000 });
      resolveScrollBinding(binding, 1000, cache);
      expect(cache.has('el-1:opacity:32')).toBe(true);
    });

    it('buckets are consistent for nearby values', () => {
      const cache = createCache();
      const binding = makeBinding({ start: 0, end: 3200 });
      // 100px per bucket → 50px and 51px should be same bucket
      const r1 = resolveScrollBinding(binding, 50, cache);
      const r2 = resolveScrollBinding(binding, 51, cache);
      expect(r1).toBe(r2);
    });
  });
});
