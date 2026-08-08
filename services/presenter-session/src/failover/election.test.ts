/**
 * @domio/presenter-session — failover election tests.
 *
 * Phase 15 W12. Verifies:
 *   - First candidate claims primary.
 *   - Second candidate becomes standby while primary is alive.
 *   - When primary's heartbeat expires, standby claims primary and bumps
 *     epoch (split-brain defence).
 *   - Voluntary step-down clears primary.
 *   - ReplayBuffer drops expired ops and evicts the oldest at capacity.
 */

import { describe, expect, it } from 'vitest';
import { Election, InMemoryElectionStore, ReplayBuffer } from './election.js';

function fixedClock(start = 1_000_000) {
  let now = start;
  return {
    fn: () => now,
    advance: (ms: number) => { now += ms; },
    set: (ms: number) => { now = ms; },
  };
}

describe('election', () => {
  it('claims primary when no primary is alive', async () => {
    const ck = fixedClock();
    const e = new Election({ candidateId: 'pod_a', store: new InMemoryElectionStore(), clock: ck.fn });
    const res = await e.tryClaim();
    expect(res.claimed).toBe(true);
    if (!res.claimed) return;
    expect(res.state.primary_id).toBe('pod_a');
    expect(res.state.epoch).toBe(1);
    expect(res.state.role).toBe('primary');
    expect(res.state.became_primary_at_ms).toBe(1_000_000);
  });

  it('declares standby when another primary is alive', async () => {
    const ck = fixedClock();
    const store = new InMemoryElectionStore();
    const a = new Election({ candidateId: 'pod_a', store, clock: ck.fn });
    await a.tryClaim();
    const b = new Election({ candidateId: 'pod_b', store, clock: ck.fn, primaryTtlMs: 60_000 });
    const res = await b.tryClaim();
    expect(res.claimed).toBe(false);
    if (res.claimed) return;
    expect(res.state.role).toBe('standby');
    expect(res.state.primary_id).toBe('pod_a');
  });

  it('promotes standby after primary heartbeat expires, bumping epoch', async () => {
    const ck = fixedClock();
    const store = new InMemoryElectionStore();
    const a = new Election({ candidateId: 'pod_a', store, clock: ck.fn });
    await a.tryClaim();
    ck.advance(20_000); // primary TTL is 15s by default — a is now stale
    const b = new Election({ candidateId: 'pod_b', store, clock: ck.fn });
    const res = await b.tryClaim();
    expect(res.claimed).toBe(true);
    if (!res.claimed) return;
    expect(res.state.primary_id).toBe('pod_b');
    expect(res.state.epoch).toBe(2);
  });

  it('rejects promotion while a fresh primary heartbeat exists (epoch fencing)', async () => {
    const ck = fixedClock();
    const store = new InMemoryElectionStore();
    const a = new Election({ candidateId: 'pod_a', store, clock: ck.fn });
    await a.tryClaim();
    ck.advance(5_000); // primary TTL 15s — a is still fresh
    const b = new Election({ candidateId: 'pod_b', store, clock: ck.fn });
    const res = await b.tryClaim();
    expect(res.claimed).toBe(false);
    if (res.claimed) return;
    expect(res.state.primary_id).toBe('pod_a');
  });

  it('stepDown clears primary', async () => {
    const ck = fixedClock();
    const store = new InMemoryElectionStore();
    const a = new Election({ candidateId: 'pod_a', store, clock: ck.fn });
    await a.tryClaim();
    const stepped = await a.stepDown();
    expect(stepped.primary_id).toBeNull();
    expect(stepped.role).toBe('disabled');
    // b can now claim
    const b = new Election({ candidateId: 'pod_b', store, clock: ck.fn });
    const res = await b.tryClaim();
    expect(res.claimed).toBe(true);
  });
});

describe('ReplayBuffer', () => {
  it('pushes and drains ops in insertion order', () => {
    const ck = fixedClock();
    const buf = new ReplayBuffer<{ capturedAtMs: number; n: number }>(10, 60_000, ck.fn);
    buf.push({ capturedAtMs: ck.fn(), n: 1 });
    ck.advance(1);
    buf.push({ capturedAtMs: ck.fn(), n: 2 });
    ck.advance(1);
    buf.push({ capturedAtMs: ck.fn(), n: 3 });
    const drained = buf.drain();
    expect(drained.map((o) => o.n)).toEqual([1, 2, 3]);
    expect(buf.size()).toBe(0);
  });

  it('drops expired ops on gc', () => {
    const ck = fixedClock();
    const buf = new ReplayBuffer<{ capturedAtMs: number; n: number }>(10, 5_000, ck.fn);
    buf.push({ capturedAtMs: ck.fn(), n: 1 });
    ck.advance(10_000);
    expect(buf.peek().length).toBe(0);
  });

  it('evicts the oldest op when capacity is reached', () => {
    const ck = fixedClock();
    // Use a clock that always advances per push so the gc drops everything,
    // emitting a 30s default TTL is too long. Override with a permissive TTL.
    const buf = new ReplayBuffer<{ capturedAtMs: number; n: number }>(2, 60_000, ck.fn);
    buf.push({ capturedAtMs: ck.fn(), n: 1 });
    ck.advance(1);
    buf.push({ capturedAtMs: ck.fn(), n: 2 });
    ck.advance(1);
    buf.push({ capturedAtMs: ck.fn(), n: 3 });
    expect(buf.peek().map((o) => o.n)).toEqual([2, 3]);
  });
});