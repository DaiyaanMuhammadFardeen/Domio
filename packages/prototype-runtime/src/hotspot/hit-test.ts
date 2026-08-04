/**
 * Hotspot hit-test for normalized-coordinate hotspots.
 *
 * Spec §M1.2: < 0.1 ms p99 hit-test, LRU-cached per slide, z-index aware
 * (innermost wins).
 *
 * Coordinates are stored in `[0..1]` space so they map cleanly onto any
 * rendered rect at any resolution. The renderer (editor / viewer) calls
 * `pickAt(slideId, xN, yN, slideSize)` with `xN, yN ∈ [0..1]`.
 *
 * LRU cache keyed by `${slideId}:${round(xN, 4)}:${round(yN, 4)}` so
 * consecutive taps on the same pixel don't re-walk the list.
 */

import type { GestureMask, Hotspot, HotspotGeometry } from '../types.js';

export interface PickResult {
  readonly hotspot: Hotspot;
  readonly gesture: GestureMask;
}

const CACHE_CAPACITY = 1024;

export class HotspotHitTester {
  private readonly cache = new Map<string, PickResult | null>();

  pickAt(
    hotspots: readonly Hotspot[],
    xN: number,
    yN: number,
    gesture: GestureMask = 'click',
  ): PickResult | null {
    if (xN < 0 || xN > 1 || yN < 0 || yN > 1) return null;
    const key = cacheKey(hotspots, xN, yN, gesture);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const sorted = [...hotspots]
      .filter((h) => h.status === 'ok' && h.gestureMask.includes(gesture))
      .sort((a, b) => b.zIndex - a.zIndex);
    let result: PickResult | null = null;
    for (const h of sorted) {
      if (inside(h.geometry, xN, yN)) {
        result = { hotspot: h, gesture };
        break;
      }
    }
    if (this.cache.size >= CACHE_CAPACITY) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }

  cacheSize(): number {
    return this.cache.size;
  }
}

function cacheKey(
  hotspots: readonly Hotspot[],
  xN: number,
  yN: number,
  gesture: GestureMask,
): string {
  // 4-decimal precision is sub-pixel at 1080p.
  const x = xN.toFixed(4);
  const y = yN.toFixed(4);
  // Touch cache if hotspot list version changes; we use length + first/last ids.
  const len = hotspots.length;
  const first = hotspots[0]?.id ?? '-';
  const last = hotspots[len - 1]?.id ?? '-';
  return `${len}:${first}:${last}:${x}:${y}:${gesture}`;
}

function inside(geom: HotspotGeometry, xN: number, yN: number): boolean {
  if (geom.kind === 'rect') {
    return xN >= geom.x && xN <= geom.x + geom.w && yN >= geom.y && yN <= geom.y + geom.h;
  }
  // Ray-cast point-in-polygon.
  const pts = geom.points;
  let insideFlag = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!;
    const pj = pts[j]!;
    const intersect =
      pi.y > yN !== pj.y > yN &&
      xN < ((pj.x - pi.x) * (yN - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersect) insideFlag = !insideFlag;
  }
  return insideFlag;
}