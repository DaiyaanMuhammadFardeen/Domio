/**
 * @domio/deep-link — KeyRotator tests.
 *
 * Covers: cold-start rotation (first rotate mints a new key),
 * 30-day TTL, 7-day overlap, retired keys no longer resolve,
 * sweep returns count.
 */

import { describe, expect, it } from 'vitest';
import {
  KeyRotator,
  KEY_TTL_MS,
  OVERLAP_MS,
  type KeyRotationStore,
  type DeepLinkSigningKey,
} from './index.js';

class InMemoryKeyStore implements KeyRotationStore {
  private rows: DeepLinkSigningKey[] = [];
  async insert(record: DeepLinkSigningKey): Promise<void> {
    this.rows.push(record);
  }
  async findActive(tenant_id: string, deck_id: string, now: number): Promise<DeepLinkSigningKey | null> {
    const active = this.rows
      .filter((k) => k.tenant_id === tenant_id && k.deck_id === deck_id)
      .filter((k) => k.not_before <= now && now <= k.not_after)
      .sort((a, b) => b.not_before - a.not_before);
    return active[0] ?? null;
  }
  async findValid(tenant_id: string, deck_id: string, now: number): Promise<readonly DeepLinkSigningKey[]> {
    return this.rows
      .filter((k) => k.tenant_id === tenant_id && k.deck_id === deck_id)
      .filter((k) => k.not_before <= now && now <= k.not_after + OVERLAP_MS);
  }
  async retireExpired(cutoff: number): Promise<number> {
    // The store does not actually mutate — sweep is a hook for the
    // Postgres implementation. We just count.
    return this.rows.filter((k) => k.not_after + OVERLAP_MS <= cutoff).length;
  }
  list(): readonly DeepLinkSigningKey[] { return this.rows; }
}

describe('KeyRotator', () => {
  it('mints a new key on cold-start rotate', async () => {
    const store = new InMemoryKeyStore();
    const rotator = new KeyRotator(store);
    const key = await rotator.rotate('t1', 'd1');
    expect(key.kid.startsWith('dlk_')).toBe(true);
    expect(key.not_after - key.not_before).toBe(KEY_TTL_MS);
    expect(store.list()).toHaveLength(1);
  });

  it('issues successive keys on repeated rotate', async () => {
    const store = new InMemoryKeyStore();
    let now = 1_000_000;
    const rotator = new KeyRotator(store, { clock: () => now });
    const a = await rotator.rotate('t1', 'd1');
    now += 1_000; // advance the clock
    const b = await rotator.rotate('t1', 'd1');
    expect(a.kid).not.toBe(b.kid);
    expect(b.not_before).toBeGreaterThan(a.not_before);
    expect(store.list()).toHaveLength(2);
  });

  it('returns the active key from signingKey', async () => {
    const store = new InMemoryKeyStore();
    const rotator = new KeyRotator(store);
    const a = await rotator.rotate('t1', 'd1');
    const active = await rotator.signingKey('t1', 'd1');
    expect(active.kid).toBe(a.kid);
  });

  it('returns both active + retiring keys during overlap window', async () => {
    const store = new InMemoryKeyStore();
    let now = 1_000_000;
    const rotator = new KeyRotator(store, { clock: () => now });
    const a = await rotator.rotate('t1', 'd1');
    // Advance past the TTL but inside the overlap
    now += KEY_TTL_MS + 1;
    const b = await rotator.rotate('t1', 'd1');
    const valid = await rotator.verificationKeys('t1', 'd1');
    expect(valid.map((k) => k.kid).sort()).toEqual([a.kid, b.kid].sort());
    void a;
    void b;
  });

  it('drops retired keys past overlap window', async () => {
    const store = new InMemoryKeyStore();
    let now = 1_000_000;
    const rotator = new KeyRotator(store, { clock: () => now });
    await rotator.rotate('t1', 'd1');
    // Advance past the full KEY_TTL_MS + OVERLAP_MS window
    now += KEY_TTL_MS + OVERLAP_MS + 1;
    const valid = await rotator.verificationKeys('t1', 'd1');
    expect(valid).toHaveLength(0);
  });

  it('sweep returns the count of retired rows', async () => {
    const store = new InMemoryKeyStore();
    let now = 1_000_000;
    const rotator = new KeyRotator(store, { clock: () => now });
    await rotator.rotate('t1', 'd1');
    now += KEY_TTL_MS + OVERLAP_MS + 1;
    const retired = await rotator.sweep();
    expect(retired).toBe(1);
  });

  it('issues a fresh key via signingKey when no active key exists', async () => {
    const store = new InMemoryKeyStore();
    const rotator = new KeyRotator(store);
    const a = await rotator.signingKey('t1', 'd1');
    expect(store.list()).toHaveLength(1);
    expect(a.kid).toBe(store.list()[0]!.kid);
  });
});