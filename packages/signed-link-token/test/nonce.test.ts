/**
 * nonce store tests.
 *
 * Covers:
 * - InMemoryNonceStore: first seen() returns true, second returns false.
 * - Nonce entries expire after TTL.
 * - NullNonceStore: always accepts.
 * - Replay rejected end-to-end: verifyLinkToken rejects a token whose
 *   nonce is already in the store.
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryNonceStore,
  NullNonceStore,
  mintLinkToken,
  verifyLinkToken,
  type ViewerClaims,
} from '../src/index.js';

const KEY = new Uint8Array(32).fill(0x37);
const CLAIMS: ViewerClaims = {
  workspace_id: 'w1',
  link_id: 'l1',
  short_id: 'ABCD1234',
};

describe('InMemoryNonceStore', () => {
  it('returns true on first seen, false on second', () => {
    const store = new InMemoryNonceStore();
    expect(store.seen('n1', 60_000)).toBe(true);
    expect(store.seen('n1', 60_000)).toBe(false);
    expect(store.size()).toBe(1);
  });

  it('expires nonces after the TTL has elapsed', () => {
    let t = 1_000_000;
    const store = new InMemoryNonceStore(() => t);
    expect(store.seen('n1', 5_000)).toBe(true);
    expect(store.seen('n1', 5_000)).toBe(false);
    t += 10_000;
    expect(store.seen('n1', 5_000)).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('clear() empties the store', () => {
    const store = new InMemoryNonceStore();
    store.seen('n1', 60_000);
    store.seen('n2', 60_000);
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.seen('n1', 60_000)).toBe(true);
  });
});

describe('NullNonceStore', () => {
  it('always accepts', () => {
    const store = new NullNonceStore();
    expect(store.seen('n1', 60_000)).toBe(true);
    expect(store.seen('n1', 60_000)).toBe(true);
    expect(store.seen('n1', 60_000)).toBe(true);
  });
});

describe('end-to-end replay rejection', () => {
  it('second verify of the same token is rejected with NONCE_REPLAYED', async () => {
    const store = new InMemoryNonceStore(() => new Date('2026-08-06T12:00:00Z').getTime());
    const tok = await mintLinkToken(
      { claims: CLAIMS, expiresAt: new Date('2030-01-01T00:00:00Z') },
      KEY,
      { clock: () => new Date('2026-08-06T12:00:00Z').getTime() },
    );
    const first = await verifyLinkToken(tok, KEY, {
      clock: () => new Date('2026-08-06T12:00:00Z').getTime(),
      nonceStore: store,
    });
    expect(first.ok).toBe(true);

    const second = await verifyLinkToken(tok, KEY, {
      clock: () => new Date('2026-08-06T12:00:00Z').getTime(),
      nonceStore: store,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('NONCE_REPLAYED');
  });

  it('NullNonceStore allows infinite replays', async () => {
    const store = new NullNonceStore();
    const tok = await mintLinkToken(
      { claims: CLAIMS, expiresAt: new Date('2030-01-01T00:00:00Z') },
      KEY,
      { clock: () => new Date('2026-08-06T12:00:00Z').getTime() },
    );
    for (let i = 0; i < 5; i++) {
      const r = await verifyLinkToken(tok, KEY, {
        clock: () => new Date('2026-08-06T12:00:00Z').getTime(),
        nonceStore: store,
      });
      expect(r.ok).toBe(true);
    }
  });
});
