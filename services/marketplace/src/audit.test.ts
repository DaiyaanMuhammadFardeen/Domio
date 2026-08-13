/**
 * Audit recorder tests (Phase 19 Wave 1).
 *
 * Chain prev_hash linkage, hash verification, seq monotonic, replay.
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryAuditRecorder,
  computeHash,
  verifyHash,
  AUDIT_KID,
  GENESIS_HASH,
} from './audit.js';
import { InMemoryMarketplaceStore } from './store/mem_store.js';
import type { AuditStore } from './audit.js';

function createStore(): AuditStore {
  return new InMemoryMarketplaceStore();
}

describe('computeHash', () => {
  it('computes deterministic HMAC-SHA256', () => {
    const h1 = computeHash({ foo: 'bar' }, 1, GENESIS_HASH);
    const h2 = computeHash({ foo: 'bar' }, 1, GENESIS_HASH);
    expect(h1).toBe(h2);
  });

  it('different payload produces different hash', () => {
    const h1 = computeHash({ foo: 'bar' }, 1, GENESIS_HASH);
    const h2 = computeHash({ foo: 'baz' }, 1, GENESIS_HASH);
    expect(h1).not.toBe(h2);
  });

  it('different seq produces different hash', () => {
    const h1 = computeHash({ foo: 'bar' }, 1, GENESIS_HASH);
    const h2 = computeHash({ foo: 'bar' }, 2, GENESIS_HASH);
    expect(h1).not.toBe(h2);
  });

  it('different prev_hash produces different hash', () => {
    const h1 = computeHash({ foo: 'bar' }, 1, GENESIS_HASH);
    const h2 = computeHash({ foo: 'bar' }, 1, 'abc123');
    expect(h1).not.toBe(h2);
  });

  it('hash is a 64-char hex string', () => {
    const h = computeHash({ test: true }, 1, GENESIS_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyHash', () => {
  it('returns true for a valid event', () => {
    const payload = { amount: 1000 };
    const seq = 1;
    const prevHash = GENESIS_HASH;
    const hash = computeHash(payload, seq, prevHash);

    expect(
      verifyHash({
        id: 'test',
        workspaceId: 'ws1',
        actorId: 'user1',
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'purchase',
        eventType: 'purchase',
        payload,
        seq,
        prevHash,
        hash,
        kid: AUDIT_KID,
        recordedAt: new Date(),
      }),
    ).toBe(true);
  });

  it('returns false for a tampered event', () => {
    const payload = { amount: 1000 };
    const seq = 1;
    const prevHash = GENESIS_HASH;
    const hash = computeHash(payload, seq, prevHash);

    expect(
      verifyHash({
        id: 'test',
        workspaceId: 'ws1',
        actorId: 'user1',
        actorType: 'user',
        actorKind: 'human',
        eventKind: 'purchase',
        eventType: 'purchase',
        payload: { amount: 9999 }, // tampered
        seq,
        prevHash,
        hash,
        kid: AUDIT_KID,
        recordedAt: new Date(),
      }),
    ).toBe(false);
  });
});

describe('InMemoryAuditRecorder', () => {
  it('records an event with seq=1 and genesis prev_hash', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const event = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 1000 },
    });

    expect(event.seq).toBe(1);
    expect(event.prevHash).toBe(GENESIS_HASH);
    expect(event.kid).toBe(AUDIT_KID);
    expect(event.hash).toBeTruthy();
    expect(verifyHash(event)).toBe(true);
  });

  it('seq is monotonic across multiple events', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const e1 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 100 },
    });
    const e2 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 200 },
    });
    const e3 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 300 },
    });

    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
  });

  it('prev_hash chains correctly', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const e1 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 100 },
    });
    const e2 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 200 },
    });

    expect(e2.prevHash).toBe(e1.hash);
  });

  it('independent chains per (workspace_id, event_kind)', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const e1 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { amount: 100 },
    });
    const e2 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'refund',
      eventType: 'refund',
      payload: { amount: 50 },
    });

    // Both start at seq=1 in their respective chains
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(1);
    expect(e1.prevHash).toBe(GENESIS_HASH);
    expect(e2.prevHash).toBe(GENESIS_HASH);
  });

  it('all events are valid by verifyHash', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        await recorder.record({
          workspaceId: 'ws1',
          actorId: 'user1',
          actorType: 'user',
          actorKind: 'human',
          eventKind: 'purchase',
          eventType: 'purchase',
          payload: { index: i, ts: Date.now() },
        }),
      );
    }

    for (const event of events) {
      expect(verifyHash(event)).toBe(true);
    }
  });

  it('handles empty payload', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const event = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: {},
    });

    expect(event.seq).toBe(1);
    expect(verifyHash(event)).toBe(true);
  });

  it('handles complex nested payload', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const event = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: {
        listing: { id: 'l1', title: 'Test' },
        amounts: [100, 200, 300],
        metadata: { key: 'value', nested: { deep: true } },
      },
    });

    expect(verifyHash(event)).toBe(true);
  });

  it('records all valid event_kinds', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const kinds = [
      'purchase',
      'refund',
      'payout',
      'takedown',
      'kyc',
      'brand_lock_curation',
      'agent_purchase',
    ] as const;

    for (const eventKind of kinds) {
      const event = await recorder.record({
        workspaceId: 'ws1',
        actorId: 'user1',
        actorType: 'user',
        actorKind: 'human',
        eventKind,
        eventType: `${eventKind}.test`,
        payload: { kind: eventKind },
      });
      expect(event.eventKind).toBe(eventKind);
      expect(verifyHash(event)).toBe(true);
    }
  });

  it('seq restarts for different workspace_id', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const e1 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { a: 1 },
    });
    const e2 = await recorder.record({
      workspaceId: 'ws2',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { a: 2 },
    });

    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(1);
  });

  it('prev_hash chains correctly across workspace_id boundaries', async () => {
    const store = createStore();
    const recorder = new InMemoryAuditRecorder(store);

    const e1 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { a: 1 },
    });
    const e2 = await recorder.record({
      workspaceId: 'ws1',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { a: 2 },
    });

    // ws2 chain starts fresh
    const e3 = await recorder.record({
      workspaceId: 'ws2',
      actorId: 'user1',
      actorType: 'user',
      actorKind: 'human',
      eventKind: 'purchase',
      eventType: 'purchase',
      payload: { a: 3 },
    });

    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(GENESIS_HASH);
  });
});
