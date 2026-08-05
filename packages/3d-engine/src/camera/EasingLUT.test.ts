import { describe, it, expect } from 'vitest';
import { cubicBezier, buildLut, EasingLutCache, defaultEase } from './EasingLUT.js';

describe('cubicBezier', () => {
  it('returns 0 at t=0', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(1)).toBe(1);
  });

  it('returns 0 for t <= 0', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(-0.5)).toBe(0);
  });

  it('returns 1 for t >= 1', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(1.5)).toBe(1);
  });

  it('is approximately 0.5 at t=0.5 for default ease-in-out', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0.5)).toBeCloseTo(0.5, 2);
  });

  it('is monotonically increasing for standard ease', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    let prev = ease(0);
    for (let i = 1; i <= 100; i++) {
      const v = ease(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('degenerate linear bezier', () => {
    const ease = cubicBezier(0, 0, 0, 0);
    expect(ease(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('buildLut', () => {
  it('builds a LUT of size 256 by default', () => {
    const lut = buildLut((t) => t);
    expect(lut.length).toBe(256);
  });

  it('first entry is 0', () => {
    const lut = buildLut((t) => t);
    expect(lut[0]).toBeCloseTo(0, 10);
  });

  it('last entry is 1', () => {
    const lut = buildLut((t) => t);
    expect(lut[lut.length - 1]).toBeCloseTo(1, 10);
  });

  it('custom size', () => {
    const lut = buildLut((t) => t, 64);
    expect(lut.length).toBe(64);
  });
});

describe('EasingLutCache', () => {
  it('caches and returns the same LUT for the same signature', () => {
    const cache = new EasingLutCache();
    const lut1 = cache.get('linear', (t) => t);
    const lut2 = cache.get('linear', (t) => t);
    expect(lut1).toBe(lut2);
  });

  it('returns different LUTs for different signatures', () => {
    const cache = new EasingLutCache();
    const lut1 = cache.get('a', (t) => t);
    const lut2 = cache.get('b', (t) => t * t);
    expect(lut1).not.toBe(lut2);
  });

  it('clear empties the cache', () => {
    const cache = new EasingLutCache();
    cache.get('a', (t) => t);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('evict removes oldest entry', () => {
    const cache = new EasingLutCache();
    expect(cache.evict()).toBe(false);
    cache.get('first', (t) => t);
    cache.get('second', (t) => t);
    expect(cache.evict()).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('evicts LRU after 1024 entries', () => {
    const cache = new EasingLutCache();
    for (let i = 0; i < 1024; i++) {
      cache.get(`key-${i}`, (t) => t);
    }
    expect(cache.size).toBe(1024);
    cache.get('overflow', (t) => t);
    expect(cache.size).toBe(1024);
    // key-0 should be evicted
    let rebuildCount = 0;
    cache.get('key-0', (t) => { rebuildCount++; return t; });
    expect(rebuildCount).toBe(256);
  });
});

describe('defaultEase', () => {
  it('returns 0 at t=0', () => {
    expect(defaultEase(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(defaultEase(1)).toBe(1);
  });

  it('is approximately 0.5 at t=0.5', () => {
    expect(defaultEase(0.5)).toBeCloseTo(0.5, 2);
  });
});
