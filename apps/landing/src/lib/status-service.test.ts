/**
 * Tests for the status service (Wave 12 §S12.8).
 *
 * Covers:
 *  - the deterministic seed (offline + network-failure paths)
 *  - the happy-path JSON shape validation
 *  - graceful fallback when the response is malformed
 *  - the seed's structural invariants (90-day history, etc.)
 */

import type { ServiceHealth } from './status-types';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testing,
  buildSeedSnapshot,
  fetchStatus,
} from './status-service';

const ORIGINAL_FETCH = globalThis.fetch;

describe('status-service', () => {
  beforeEach(() => {
    // Make sure each test starts from a clean clock-independent seed.
    globalThis.fetch = ORIGINAL_FETCH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it('buildSeedSnapshot returns 8 services each with a 90-day history', () => {
    const snap = buildSeedSnapshot();
    expect(snap.services).toHaveLength(8);
    for (const svc of snap.services) {
      expect(svc.history).toHaveLength(__testing.HISTORY_LENGTH);
    }
    const ids = new Set(snap.services.map((s) => s.id));
    for (const expected of __testing.SERVICE_IDS) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it('buildSeedSnapshot is deterministic across calls', () => {
    const a = buildSeedSnapshot();
    const b = buildSeedSnapshot();
    expect(a).toEqual(b);
  });

  it('uptimePct treats operational + maintenance as healthy', () => {
    const history: ReadonlyArray<ServiceHealth> = [
      'operational',
      'operational',
      'maintenance',
      'degraded',
      'partial_outage',
    ];
    // 3 healthy out of 5 = 60%
    expect(__testing.uptimePct(history)).toBe(60);
  });

  it('pickHealth is deterministic for the same seed', () => {
    expect(__testing.pickHealth('foo')).toBe(__testing.pickHealth('foo'));
    expect(__testing.pickHealth('bar')).not.toBeNull();
  });

  it('falls back to the seed when offline=true', async () => {
    const snap = await fetchStatus({ offline: true });
    expect(snap.services).toHaveLength(8);
    const ids = snap.services.map((s) => s.id);
    expect(ids).toContain('auth');
    expect(ids).toContain('realtime-ws');
  });

  it('falls back to the seed when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const snap = await fetchStatus();
    expect(snap.services).toHaveLength(8);
  });

  it('falls back to the seed on a non-2xx response', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('boom', { status: 503 }),
    ) as unknown as typeof fetch;
    const snap = await fetchStatus();
    expect(snap.services).toHaveLength(8);
  });

  it('falls back to the seed when the JSON shape is invalid', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ not: 'a status snapshot' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const snap = await fetchStatus();
    expect(snap.services).toHaveLength(8);
  });

  it('parses a well-formed response and returns it directly', async () => {
    const seed = buildSeedSnapshot();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(seed), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const snap = await fetchStatus();
    expect(snap.overall).toBe(seed.overall);
    expect(snap.services).toHaveLength(seed.services.length);
    expect(snap.fetched_at_ms).toBe(seed.fetched_at_ms);
  });

  it('strips malformed services from a partial response', async () => {
    const seed = buildSeedSnapshot();
    const good = seed.services[0]!;
    const bad = { id: 'broken' /* missing fields */ };
    const payload = {
      overall: 'operational',
      services: [good, bad],
      incidents: [],
      fetched_at_ms: seed.fetched_at_ms,
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const snap = await fetchStatus();
    expect(snap.services.map((s) => s.id)).toEqual([good.id]);
  });
});