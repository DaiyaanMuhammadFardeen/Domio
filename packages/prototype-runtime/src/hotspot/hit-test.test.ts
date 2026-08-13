/**
 * Hotspot hit-test tests.
 */

import { describe, expect, it } from 'vitest';
import { HotspotHitTester } from './hit-test.js';
import type { Hotspot } from '../types.js';

function rect(x: number, y: number, w: number, h: number) {
  return { kind: 'rect' as const, x, y, w, h };
}

function poly(...points: Array<[number, number]>) {
  return {
    kind: 'polygon' as const,
    points: points.map(([x, y]) => ({ x, y })),
  };
}

function hotspot(over: Partial<Hotspot> & { id: string }): Hotspot {
  return {
    tenantId: 't1',
    deckId: 'd1',
    slideId: 's1',
    name: over.id,
    geometry: over.geometry ?? rect(0, 0, 1, 1),
    gestureMask: over.gestureMask ?? ['click'],
    zIndex: over.zIndex ?? 0,
    targetType: 'slide',
    targetRef: {},
    status: 'ok',
    version: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('HotspotHitTester', () => {
  it('returns null for out-of-range coordinates', () => {
    const t = new HotspotHitTester();
    expect(t.pickAt([hotspot({ id: 'a' })], -0.1, 0.5)).toBe(null);
    expect(t.pickAt([hotspot({ id: 'a' })], 0.5, 1.5)).toBe(null);
  });

  it('picks a rect hotspot', () => {
    const t = new HotspotHitTester();
    const hs = hotspot({ id: 'a', geometry: rect(0.1, 0.1, 0.5, 0.5) });
    expect(t.pickAt([hs], 0.3, 0.3, 'click')).not.toBe(null);
    expect(t.pickAt([hs], 0.9, 0.9, 'click')).toBe(null);
  });

  it('picks a polygon hotspot via ray-cast', () => {
    const t = new HotspotHitTester();
    // triangle covering (0.25, 0.5)
    const hs = hotspot({ id: 'tri', geometry: poly([0.1, 0.9], [0.5, 0.1], [0.9, 0.9]) });
    expect(t.pickAt([hs], 0.5, 0.5, 'click')).not.toBe(null);
    expect(t.pickAt([hs], 0.95, 0.5, 'click')).toBe(null);
  });

  it('z-index: innermost wins on overlap', () => {
    const t = new HotspotHitTester();
    const big = hotspot({ id: 'big', geometry: rect(0, 0, 1, 1), zIndex: 1 });
    const small = hotspot({ id: 'small', geometry: rect(0.2, 0.2, 0.6, 0.6), zIndex: 10 });
    const r = t.pickAt([big, small], 0.5, 0.5, 'click');
    expect(r?.hotspot.id).toBe('small');
  });

  it('skips hotspots with status=dangling', () => {
    const t = new HotspotHitTester();
    const hs = hotspot({ id: 'a', status: 'dangling' });
    expect(t.pickAt([hs], 0.5, 0.5, 'click')).toBe(null);
  });

  it('respects gesture mask', () => {
    const t = new HotspotHitTester();
    const hs = hotspot({ id: 'a', gestureMask: ['hover'] });
    expect(t.pickAt([hs], 0.5, 0.5, 'click')).toBe(null);
    expect(t.pickAt([hs], 0.5, 0.5, 'hover')).not.toBe(null);
  });

  it('LRU cache evicts under pressure', () => {
    const t = new HotspotHitTester();
    t.clearCache();
    const hs = hotspot({ id: 'a', geometry: rect(0, 0, 1, 1) });
    for (let i = 0; i < 1100; i++) {
      // Use 4-decimal coords so cache keys diverge — at 1080p, this is sub-pixel.
      t.pickAt([hs], i / 1100, 0.5, 'click');
    }
    // Cache should have evicted older entries (cap 1024).
    expect(t.cacheSize()).toBeLessThanOrEqual(1024);
  });

  it('cacheSize reports current entries', () => {
    const t = new HotspotHitTester();
    t.clearCache();
    const hs = hotspot({ id: 'a' });
    t.pickAt([hs], 0.5, 0.5);
    expect(t.cacheSize()).toBe(1);
  });

  it('clearCache resets', () => {
    const t = new HotspotHitTester();
    const hs = hotspot({ id: 'a' });
    t.pickAt([hs], 0.5, 0.5);
    t.clearCache();
    expect(t.cacheSize()).toBe(0);
  });

  it('returns null for empty hotspot list', () => {
    expect(new HotspotHitTester().pickAt([], 0.5, 0.5)).toBe(null);
  });
});
