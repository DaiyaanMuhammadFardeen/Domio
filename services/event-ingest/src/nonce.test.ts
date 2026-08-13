/**
 * Tests for the in-memory nonce cache (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildMemoryNonceCache } from './nonce.js';
import { ReplayError } from './errors.js';

describe('memory nonce cache', () => {
  it('accepts a fresh nonce', async () => {
    const cache = buildMemoryNonceCache();
    await cache.checkAndStore('abc12345', 1000, 60_000);
  });

  it('rejects a duplicate nonce', async () => {
    const cache = buildMemoryNonceCache();
    await cache.checkAndStore('abc12345', 1000, 60_000);
    await expect(cache.checkAndStore('abc12345', 1001, 60_000)).rejects.toBeInstanceOf(ReplayError);
  });

  it('accepts a nonce whose previous entry expired', async () => {
    const cache = buildMemoryNonceCache();
    await cache.checkAndStore('abc12345', 1000, 100);
    await cache.checkAndStore('abc12345', 2000, 100);
  });

  it('reset clears the cache', async () => {
    const cache = buildMemoryNonceCache();
    await cache.checkAndStore('abc12345', 1000, 60_000);
    await cache.reset();
    await cache.checkAndStore('abc12345', 1500, 60_000);
  });
});
