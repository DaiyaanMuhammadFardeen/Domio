/**
 * Render cache with configurable TTL.
 *
 * In-memory Map keyed by cache_key → { html, rendered_at, expires_at }.
 * TTL defaults to 30 days. Injectable clock for deterministic tests.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface CacheEntry {
  readonly html: string;
  readonly rendered_at: string;
  readonly expires_at: string;
}

export interface CacheDeps {
  /** Injectable clock — defaults to Date.now. */
  readonly now?: () => number;
  /** TTL in milliseconds — defaults to 30 days. */
  readonly ttlMs?: number;
}

export class RenderCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly clock: () => number;
  private readonly ttlMs: number;

  constructor(deps: CacheDeps = {}) {
    this.clock = deps.now ?? (() => Date.now());
    this.ttlMs = deps.ttlMs ?? THIRTY_DAYS_MS;
  }

  /**
   * Store a rendered result in the cache.
   */
  set(cacheKey: string, html: string, renderedAt: string): void {
    const now = this.clock();
    const expiresAt = new Date(now + this.ttlMs).toISOString();
    this.store.set(cacheKey, {
      html,
      rendered_at: renderedAt,
      expires_at: expiresAt,
    });
  }

  /**
   * Retrieve a cached entry if it exists and is fresh.
   * Returns null if missing or expired.
   */
  get(cacheKey: string): CacheEntry | null {
    const entry = this.store.get(cacheKey);
    if (!entry) return null;

    const now = this.clock();
    const expiresAt = new Date(entry.expires_at).getTime();
    if (now > expiresAt) {
      this.store.delete(cacheKey);
      return null;
    }

    return entry;
  }

  /**
   * Number of active (non-expired) entries.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.store.clear();
  }
}
