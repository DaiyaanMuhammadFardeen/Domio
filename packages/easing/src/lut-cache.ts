/**
 * LRU cache for pre-computed easing LUTs.
 *
 * Keys are curve-signature strings (e.g. `"cubic:0.25,0.1,0.25,1.0"`).
 * Values are cached `Float64Array` LUTs. Eviction is LRU with a
 * maximum of 1024 entries.
 */

import { buildLut } from './lut-builder.js';

/** Max entries in the cache before LRU eviction. */
const MAX_ENTRIES = 1024;

/**
 * LRU cache for easing curve LUTs.
 */
export class LutCache {
  private cache = new Map<string, Float64Array>();

  /**
   * Get a cached LUT, building it if absent.
   *
   * @param sig     - Curve signature string
   * @param buildFn - Builder function (called on cache miss)
   * @returns The cached `Float64Array` LUT
   */
  get(sig: string, buildFn: (t: number) => number): Float64Array {
    let lut = this.cache.get(sig);
    if (lut !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(sig);
      this.cache.set(sig, lut);
      return lut;
    }
    // Build and cache
    lut = buildLut(buildFn);
    this.cache.set(sig, lut);
    // Evict LRU if over capacity
    if (this.cache.size > MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    return lut;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Current number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict the oldest entry (explicit pressure).
   * @returns `true` if an entry was evicted, `false` if cache was empty
   */
  evict(): boolean {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      return true;
    }
    return false;
  }
}
