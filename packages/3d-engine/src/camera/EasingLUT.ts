/**
 * Easing LUT — local cubic Bezier solver and LUT cache.
 *
 * Implements a local bezier evaluator (no workspace deps) following the
 * pattern from @domio/easing.  The LUT caches pre-computed easing values
 * for fast runtime evaluation.
 */

// ---------------------------------------------------------------------------
// Cubic Bézier solver (local — no workspace deps)
// ---------------------------------------------------------------------------

function clampY(y: number): number {
  if (y < -0.25) return -0.25;
  if (y > 1.25) return 1.25;
  return y;
}

/**
 * Create a cubic Bezier easing function from control points.
 *
 * @param x1 - x of first control point [0, 1]
 * @param y1 - y of first control point (may overshoot)
 * @param x2 - x of second control point [0, 1]
 * @param y2 - y of second control point (may overshoot)
 * @returns A function `(t: number) => number` with output clamped to [-0.25, 1.25]
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const isLinearX = x1 === x2;
  if (isLinearX && x1 === 0) {
    return (t: number): number => clampY(t);
  }
  if (isLinearX && x1 === 1) {
    return (t: number): number => clampY(t);
  }

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (tt: number): number => ((ax * tt + bx) * tt + cx) * tt;
  const sampleY = (tt: number): number => ((ay * tt + by) * tt + cy) * tt;
  const sampleDX = (tt: number): number => (3 * ax * tt + 2 * bx) * tt + cx;

  const solveForX = (targetX: number): number => {
    let tt = targetX;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(tt) - targetX;
      if (Math.abs(err) < 1e-7) break;
      const dx = sampleDX(tt);
      if (Math.abs(dx) < 1e-7) break;
      tt -= err / dx;
    }
    return Math.max(0, Math.min(1, tt));
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const paramT = solveForX(t);
    return clampY(sampleY(paramT));
  };
}

// ---------------------------------------------------------------------------
// LUT builder
// ---------------------------------------------------------------------------

/**
 * Build a LUT from any easing function.
 *
 * @param easingFn - An easing function `(t: number) => number`
 * @param size - Number of entries (default 256)
 * @returns A `Float64Array` of size `size` with values in [-0.25, 1.25]
 */
export function buildLut(
  easingFn: (t: number) => number,
  size = 256,
): Float64Array {
  const lut = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let v = easingFn(t);
    if (v < -0.25) v = -0.25;
    if (v > 1.25) v = 1.25;
    lut[i] = v;
  }
  return lut;
}

// ---------------------------------------------------------------------------
// LUT cache (LRU, max 1024 entries)
// ---------------------------------------------------------------------------

const MAX_CACHE_ENTRIES = 1024;

export class EasingLutCache {
  private cache = new Map<string, Float64Array>();

  /**
   * Get a cached LUT, building it if absent.
   *
   * @param sig - Curve signature string (e.g. "cubic:0.42,0,0.58,1")
   * @param buildFn - Builder function (called on cache miss)
   * @returns The cached `Float64Array` LUT
   */
  get(sig: string, buildFn: (t: number) => number): Float64Array {
    let lut = this.cache.get(sig);
    if (lut !== undefined) {
      this.cache.delete(sig);
      this.cache.set(sig, lut);
      return lut;
    }
    lut = buildLut(buildFn);
    this.cache.set(sig, lut);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    return lut;
  }

  /** Clear the cache. */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Evict the oldest entry. */
  evict(): boolean {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Default easing
// ---------------------------------------------------------------------------

/** Default cubic Bezier [0.42, 0, 0.58, 1] — ease-in-out. */
export const DEFAULT_EASING: [number, number, number, number] = [0.42, 0, 0.58, 1];

/**
 * Create a default easing function.
 */
export function createDefaultEasing(): (t: number) => number {
  return cubicBezier(...DEFAULT_EASING);
}

/**
 * Evaluate the default easing at a given time.
 */
export function defaultEase(t: number): number {
  return cubicBezier(0.42, 0, 0.58, 1)(t);
}
