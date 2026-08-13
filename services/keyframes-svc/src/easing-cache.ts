/**
 * Phase 11 camera keyframe — local easing LRU cache.
 *
 * LRU (capacity 64) keyed by `easing-key|n-samples`.
 * hitRate counter exposed for tests.
 *
 * NOTE: packages/easing exists with LutCache/validateBezier/cubicBezier, but
 * @domio/easing is NOT in tsconfig.base.json paths — import would fail at
 * typecheck.  Using local implementation to avoid dependency risk.
 */

export class EasingLruCache {
  private cache = new Map<string, Float64Array>();
  private _hits = 0;
  private _misses = 0;
  private readonly capacity: number;

  constructor(capacity: number = 64) {
    this.capacity = capacity;
  }

  get(key: string): Float64Array | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this._hits++;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, val);
      return val;
    }
    this._misses++;
    return undefined;
  }

  set(key: string, value: Float64Array): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    // Evict LRU if over capacity
    if (this.cache.size > this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /** Hit rate (0..1). Exposed for tests. */
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  get size(): number {
    return this.cache.size;
  }

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  clear(): void {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
  }
}

/**
 * Build easing key from bezier parameters and sample count.
 */
export function easingKey(
  easing: {
    readonly p1x: number;
    readonly p1y: number;
    readonly p2x: number;
    readonly p2y: number;
  },
  nSamples: number,
): string {
  return `${easing.p1x},${easing.p1y},${easing.p2x},${easing.p2y}|${nSamples}`;
}
