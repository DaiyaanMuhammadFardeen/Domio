/**
 * Event-ingest — nonce cache (Phase 17 W1).
 *
 * Stores (nonce, expires_at) so the same X-Domio-Nonce cannot be reused
 * within `ttlMs`. Backed by Redis in production; in-memory Map for
 * tests and dev.
 */

import { ReplayError } from './errors.js';

export interface NonceCache {
  /** Throws ReplayError if nonce was seen; otherwise records it. */
  checkAndStore(nonce: string, now: number, ttlMs: number): Promise<void>;
  /** Test-only: drop everything. */
  reset(): Promise<void>;
}

interface Entry {
  expiresAt: number;
}

export function buildMemoryNonceCache(): NonceCache {
  const map = new Map<string, Entry>();
  return {
    async checkAndStore(nonce, now, ttlMs) {
      // Sweep expired entries opportunistically (cheap at low volume).
      if (map.size > 1024) {
        for (const [k, v] of map) {
          if (v.expiresAt <= now) map.delete(k);
        }
      }
      const existing = map.get(nonce);
      if (existing && existing.expiresAt > now) {
        throw new ReplayError(`nonce ${nonce.slice(0, 8)}… already seen`);
      }
      map.set(nonce, { expiresAt: now + ttlMs });
    },
    async reset() {
      map.clear();
    },
  };
}

/**
 * Build a Redis-backed nonce cache. The function is lazy-loaded so
 * tests that don't need Redis can avoid the ioredis dependency.
 *
 * @param url Either `memory` (returns the memory cache) or a redis:// URL.
 */
export async function buildRedisNonceCache(url: string): Promise<NonceCache> {
  if (url === 'memory' || url === '') {
    return buildMemoryNonceCache();
  }
  const { default: Redis } = await import('ioredis');
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  return {
    async checkAndStore(nonce, now, ttlMs) {
      const key = `domio:ingest:nonce:${nonce}`;
      // SET key value NX PX ttlMs returns 'OK' if it succeeded.
      const result = await client.set(key, String(now), 'PX', ttlMs, 'NX');
      if (result !== 'OK') {
        throw new ReplayError(`nonce ${nonce.slice(0, 8)}… already seen`);
      }
    },
    async reset() {
      // SCAN + DEL would be slow at scale; we intentionally do not
      // expose reset() against a live Redis. Tests use buildMemoryNonceCache.
      throw new Error('reset() is not supported on the Redis-backed nonce cache');
    },
  };
}
