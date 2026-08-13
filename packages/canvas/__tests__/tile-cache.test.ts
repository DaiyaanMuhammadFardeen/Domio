import { describe, it, expect } from 'vitest';
import { TileCache } from '../src/renderer/tile-cache.js';

class FakeClock {
  private current = 0;
  readonly now: () => number = () => this.current;
  advance(ms: number): void {
    this.current += ms;
  }
}

describe('TileCache', () => {
  it('returns inserted tiles', () => {
    const cache = new TileCache<number>();
    cache.put({ tx: 0, ty: 0 }, 1, 100);
    expect(cache.get({ tx: 0, ty: 0 })).toBe(1);
  });

  it('evicts LRU entries when over budget', () => {
    const cache = new TileCache<string>({ maxBytes: 250 });
    cache.put({ tx: 0, ty: 0 }, 'a', 100);
    cache.put({ tx: 1, ty: 0 }, 'b', 100);
    cache.put({ tx: 0, ty: 0 }, 'a2', 100); // touches tile 0,0 — most recent
    cache.put({ tx: 2, ty: 0 }, 'c', 100); // pushes oldest out (tile 1,0)
    expect(cache.get({ tx: 1, ty: 0 })).toBeUndefined();
    expect(cache.get({ tx: 0, ty: 0 })).toBe('a2');
    expect(cache.get({ tx: 2, ty: 0 })).toBe('c');
  });

  it('expires tiles past TTL', () => {
    const clock = new FakeClock();
    const cache = new TileCache<number>({ ttlMs: 30_000, now: clock.now });
    cache.put({ tx: 0, ty: 0 }, 1, 100);
    clock.advance(29_000);
    expect(cache.get({ tx: 0, ty: 0 })).toBe(1);
    clock.advance(2_000);
    expect(cache.get({ tx: 0, ty: 0 })).toBeUndefined();
  });

  it('invalidates a single tile', () => {
    const cache = new TileCache<number>();
    cache.put({ tx: 0, ty: 0 }, 1, 100);
    cache.invalidate({ tx: 0, ty: 0 });
    expect(cache.get({ tx: 0, ty: 0 })).toBeUndefined();
  });

  it('invalidates a region of tiles', () => {
    const cache = new TileCache<number>();
    cache.put({ tx: 0, ty: 0 }, 1, 100);
    cache.put({ tx: 1, ty: 0 }, 2, 100);
    cache.put({ tx: 2, ty: 0 }, 3, 100);
    cache.invalidateRegion({ tx: 0, ty: 0 }, 1);
    expect(cache.get({ tx: 0, ty: 0 })).toBeUndefined();
    expect(cache.get({ tx: 1, ty: 0 })).toBeUndefined();
    expect(cache.get({ tx: 2, ty: 0 })).toBe(3);
  });

  it('clears all entries', () => {
    const cache = new TileCache<number>();
    cache.put({ tx: 0, ty: 0 }, 1, 100);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
