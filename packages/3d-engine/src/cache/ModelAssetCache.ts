/**
 * @domio/3d-engine — model asset cache (LRU).
 *
 * Hot cache by `model_asset.id` with configurable capacity (default 32).
 * CDN URL reuse: same id + url → cached instance. Async load via
 * injectable loader function.
 */

import type { LoadedModel } from '../contracts/renderer.v1.js';

export interface CachedModel {
  id: string;
  url: string;
  model: LoadedModel;
  /** Timestamp of last access (for LRU). */
  lastAccessed: number;
}

export type ModelLoaderFn = (url: string) => Promise<LoadedModel>;
export type ClockFn = () => number;

export class ModelAssetCache {
  private _cache = new Map<string, CachedModel>();
  private _capacity: number;
  private _loader: ModelLoaderFn;
  private _clock: ClockFn;
  private _counter = 0;

  constructor(deps?: { capacity?: number; loader?: ModelLoaderFn; clock?: ClockFn }) {
    this._capacity = deps?.capacity ?? 32;
    this._loader = deps?.loader ?? (async () => {
      throw new Error('ModelAssetCache: no loader provided');
    });
    this._clock = deps?.clock ?? Date.now;
  }

  /**
   * Get a cached model by id and url.
   * Returns `undefined` on cache miss.
   */
  get(id: string, url: string): CachedModel | undefined {
    const key = this._key(id, url);
    const entry = this._cache.get(key);
    if (entry) {
      entry.lastAccessed = this._clock() + (this._counter++);
      return entry;
    }
    return undefined;
  }

  /**
   * Load a model, using the cache when available.
   * On miss: loads via the injectable loader, stores in cache, evicts LRU if needed.
   */
  async load(id: string, url: string): Promise<CachedModel> {
    const existing = this.get(id, url);
    if (existing) return existing;

    // Cache miss — load.
    const model = await this._loader(url);
    const entry: CachedModel = {
      id,
      url,
      model,
      lastAccessed: this._clock() + (this._counter++),
    };

    // Evict LRU if at capacity.
    if (this._cache.size >= this._capacity) {
      this._evictLRU();
    }

    this._cache.set(this._key(id, url), entry);
    return entry;
  }

  /**
   * Check if a model is cached.
   */
  has(id: string, url: string): boolean {
    return this._cache.has(this._key(id, url));
  }

  /**
   * Get the current cache size.
   */
  get size(): number {
    return this._cache.size;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this._cache.clear();
  }

  /**
   * Remove a specific model from the cache.
   */
  delete(id: string, url: string): boolean {
    return this._cache.delete(this._key(id, url));
  }

  /**
   * List all cached model ids.
   */
  keys(): string[] {
    return Array.from(this._cache.keys());
  }

  private _key(id: string, url: string): string {
    return `${id}::${url}`;
  }

  private _evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this._cache.delete(oldestKey);
    }
  }
}
