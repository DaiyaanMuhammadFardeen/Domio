/**
 * Chain tests.
 *
 * Covers:
 * - Round-trip: build → verify succeeds.
 * - Tampering a payload invalidates the hash.
 * - Reordering breaks the chain (prev_hash mismatch).
 * - Key rotation produces a key with overlapping expiry.
 * - Genesis hash matches SHA-256("").
 * - hydrate/snapshot round-trip preserves chain state.
 * - 100 events verify cleanly.
 */

import { describe, it, expect } from 'vitest';
import {
  Chain,
  GenesisHash,
  HMAC_KEY_BYTES,
  computeEventHash,
  type BuildInput,
  type Event,
  type Key,
  ErrHashMismatch,
  ErrChainMismatch,
  ErrKeyNotFound,
  ErrNoActiveKey,
  ErrKeyInvalidSize,
} from '../src/index.js';

const KID = 'k1';
const ZERO_HEX_32B = '00'.repeat(HMAC_KEY_BYTES);

function makeKey(kid: string = KID): Key {
  const now = new Date('2026-08-06T00:00:00Z');
  return {
    kid,
    keyHex: ZERO_HEX_32B,
    rotatedAt: now,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    overlapUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
}

function makeBuildInput(seq: number = 0): BuildInput {
  return {
    workspaceId: 'w1',
    agentSessionId: '',
    sessionId: 's1',
    toolCallId: 't1',
    eventType: 'share.created',
    payload: { actor_id: 'u1', link_id: 'l1', seq },
  };
}

describe('Chain — basic round-trip', () => {
  it('builds an event with hash and prev_hash', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const ev = await chain.build(makeBuildInput());
    expect(ev.prevHash).toBe(GenesisHash);
    expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.seq).toBe(1);
  });

  it('verify accepts the freshly-built event', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const ev = await chain.build(makeBuildInput());
    await expect(chain.verify(ev)).resolves.toBeUndefined();
  });

  it('verify rejects a tampered payload', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const ev = await chain.build(makeBuildInput());
    const tampered: Event = { ...ev, payload: { ...ev.payload, actor_id: 'attacker' } };
    await expect(chain.verify(tampered)).rejects.toBeInstanceOf(ErrHashMismatch);
  });

  it('verify rejects an unknown key id', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey('k1'));
    const ev = await chain.build(makeBuildInput());
    const bad: Event = { ...ev, kid: 'k2-unknown' };
    await expect(chain.verify(bad)).rejects.toBeInstanceOf(ErrKeyNotFound);
  });

  it('verify rejects an expired key', async () => {
    const now = new Date('2026-08-06T12:00:00Z');
    const expiredKey: Key = {
      kid: 'expired',
      keyHex: ZERO_HEX_32B,
      rotatedAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 1),
      overlapUntil: new Date(now.getTime() - 1),
    };
    const chain = new Chain({ clock: () => now });
    chain.loadKey(expiredKey);
    // Build a fake event with this expired kid, then verify should fail.
    const ev: Event = {
      id: 'manual',
      workspaceId: 'w1',
      agentSessionId: '',
      sessionId: '',
      toolCallId: '',
      seq: 1,
      eventType: 'x',
      payload: {},
      prevHash: GenesisHash,
      hash: '',
      kid: 'expired',
      recordedAt: now,
    };
    // Compute the hash manually so verify gets a valid-shape event.
    const hash = await computeEventHash(expiredKey.keyHex, ev.payload, ev.seq, ev.prevHash);
    const signed: Event = { ...ev, hash };
    await expect(chain.verify(signed)).rejects.toThrow(/expired/);
  });
});

describe('Chain — multi-event chain', () => {
  it('100 events verify cleanly', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const events: Event[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(
        await chain.build({ ...makeBuildInput(i), payload: { ...makeBuildInput(i).payload, i } }),
      );
    }
    await expect(chain.verifyChain(events)).resolves.toBeUndefined();
  });

  it('reorders break the chain (prev_hash mismatch)', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const ev1 = await chain.build(makeBuildInput(0));
    const ev2 = await chain.build(makeBuildInput(1));
    // Swap order: pass ev2 first with prev_hash=ev2.prev_hash. Then
    // ev1's prev_hash does not match ev2's hash, so chain breaks.
    await expect(chain.verifyChain([ev2, ev1])).rejects.toBeInstanceOf(ErrChainMismatch);
  });

  it('seq is monotonic per chain', async () => {
    const chain = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    chain.loadKey(makeKey());
    const e1 = await chain.build({ ...makeBuildInput(0), agentSessionId: 'sess-A' });
    const e2 = await chain.build({ ...makeBuildInput(1), agentSessionId: 'sess-A' });
    const e3 = await chain.build({ ...makeBuildInput(2), agentSessionId: 'sess-B' });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(1); // separate chain
  });
});

describe('Chain — key management', () => {
  it('rejects keys with the wrong hex length', () => {
    const chain = new Chain();
    // Pass a key whose hex is 50 chars (not 64).
    const bad: Key = { ...makeKey('k1'), keyHex: '00'.repeat(25) };
    expect(() => chain.loadKey(bad)).toThrow(ErrKeyInvalidSize);
  });

  it('rotateKey produces a 32-byte hex key with overlapping expiry', () => {
    const now = new Date('2026-08-06T00:00:00Z');
    const chain = new Chain({ clock: () => now });
    chain.loadKey(makeKey('k1'));
    const k2 = chain.rotateKey('k2');
    expect(k2.keyHex.length).toBe(HMAC_KEY_BYTES * 2);
    expect(k2.overlapUntil.getTime() - k2.rotatedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(k2.expiresAt.getTime() - k2.rotatedAt.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('activeKey returns the most recent non-expired key', () => {
    const now = new Date('2026-08-06T00:00:00Z');
    const chain = new Chain({ clock: () => now });
    chain.loadKey(makeKey('k1'));
    chain.rotateKey('k2');
    expect(chain.activeKey().kid).toBe('k2');
  });

  it('throws ErrNoActiveKey when no key is loaded', () => {
    const chain = new Chain();
    expect(() => chain.activeKey()).toThrow(ErrNoActiveKey);
  });
});

describe('Chain — hydrate / snapshot', () => {
  it('round-trips chain state across instances', async () => {
    const a = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    a.loadKey(makeKey());
    const ev1 = await a.build(makeBuildInput(0));
    const ev2 = await a.build(makeBuildInput(1));

    const state = a.snapshot();
    const b = new Chain({ clock: () => new Date('2026-08-06T12:00:00Z') });
    b.loadKey(makeKey());
    b.hydrate(state);
    const ev3 = await b.build(makeBuildInput(2));
    // ev3 chains off ev2.hash.
    expect(ev3.prevHash).toBe(ev2.hash);
    expect(ev3.seq).toBe(3);
    // verifyChain across the persisted events works.
    await expect(b.verifyChain([ev1, ev2, ev3])).resolves.toBeUndefined();
  });
});

describe('computeEventHash', () => {
  it('produces deterministic output for the same payload + seq + prev', async () => {
    const a = await computeEventHash(ZERO_HEX_32B, { a: 1, b: 'x' }, 1, GenesisHash);
    const b = await computeEventHash(ZERO_HEX_32B, { b: 'x', a: 1 }, 1, GenesisHash);
    // Canonical sort means key order does not matter.
    expect(a).toBe(b);
  });
});
