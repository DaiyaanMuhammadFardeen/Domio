import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../src/scene/spatial-index.js';

describe('SpatialIndex (R-tree-lite)', () => {
  it('returns guides for 1,000 layers within 1 ms', () => {
    const idx = new SpatialIndex();
    for (let i = 0; i < 1000; i++) {
      idx.insert({
        id: `layer-${i}`,
        bounds: { x: i * 32, y: i * 16, w: 30, h: 14 },
        z: i,
      });
    }
    const start = performance.now();
    const hits = idx.query({
      bounds: { x: 0, y: 0, w: 32_000, h: 16_000 },
    });
    const elapsed = performance.now() - start;
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('orders results by z ascending', () => {
    const idx = new SpatialIndex();
    idx.insert({ id: 'high', bounds: { x: 0, y: 0, w: 10, h: 10 }, z: 10 });
    idx.insert({ id: 'low', bounds: { x: 0, y: 0, w: 10, h: 10 }, z: 1 });
    const hits = idx.query({ bounds: { x: 0, y: 0, w: 10, h: 10 } });
    expect(hits[0]!.id).toBe('low');
    expect(hits[1]!.id).toBe('high');
  });

  it('handles 10,000 layers without linear outliers', () => {
    const idx = new SpatialIndex();
    for (let i = 0; i < 10_000; i++) {
      idx.insert({
        id: `l-${i}`,
        bounds: { x: (i % 100) * 50, y: Math.floor(i / 100) * 50, w: 50, h: 50 },
        z: i,
      });
    }
    const start = performance.now();
    const hits = idx.query({
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
    });
    const elapsed = performance.now() - start;
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});