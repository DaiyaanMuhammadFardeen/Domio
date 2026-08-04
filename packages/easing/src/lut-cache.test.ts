import { describe, it, expect } from 'vitest';
import { LutCache } from './lut-cache.js';

describe('LutCache', () => {
  it('caches and returns the same LUT for the same signature', () => {
    const cache = new LutCache();
    const buildFn = (t: number) => t;
    const lut1 = cache.get('linear', buildFn);
    const lut2 = cache.get('linear', buildFn);
    expect(lut1).toBe(lut2); // same reference — no rebuild
  });

  it('returns different LUTs for different signatures', () => {
    const cache = new LutCache();
    const lut1 = cache.get('curve-a', (t) => t);
    const lut2 = cache.get('curve-b', (t) => t * t);
    expect(lut1).not.toBe(lut2);
  });

  it('evicts oldest entry after exceeding 1024 entries', () => {
    const cache = new LutCache();

    // Fill to capacity
    for (let i = 0; i < 1024; i++) {
      cache.get(`key-${i}`, (t) => t);
    }
    expect(cache.size).toBe(1024);

    // Adding one more should evict the oldest
    cache.get('key-1024', (t) => t);
    expect(cache.size).toBe(1024);

    // key-0 should have been evicted — buildFn will be called again (256 times via buildLut)
    let rebuildCount = 0;
    cache.get('key-0', (t) => {
      rebuildCount++;
      return t;
    });
    expect(rebuildCount).toBe(256); // rebuild happened — was evicted (buildLut calls fn 256 times)
  });

  it('get returns cached value without re-running build on hit', () => {
    const cache = new LutCache();
    let buildCount = 0;
    const buildFn = (t: number) => {
      buildCount++;
      return t;
    };

    cache.get('sig', buildFn);
    expect(buildCount).toBe(256); // buildLut calls fn 256 times

    cache.get('sig', buildFn);
    expect(buildCount).toBe(256); // no rebuild — same count
  });

  it('clear empties the cache', () => {
    const cache = new LutCache();
    cache.get('a', (t) => t);
    cache.get('b', (t) => t);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('evict removes oldest entry and returns true', () => {
    const cache = new LutCache();
    expect(cache.evict()).toBe(false); // empty cache

    cache.get('first', (t) => t);
    cache.get('second', (t) => t);
    expect(cache.evict()).toBe(true);
    expect(cache.size).toBe(1);
  });
});
