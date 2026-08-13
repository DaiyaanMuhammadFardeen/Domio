/**
 * agent-diff-service — Wave 10 §S10.10 unit tests.
 *
 * Verifies the typed client + seed fallback behaviour:
 *   - getProposedDiff returns seed data when fetch fails
 *   - getProposedDiff returns the parsed payload when fetch succeeds
 *   - approveDiff returns the applied timestamp from the backend
 *   - rejectDiff resolves on a 2xx response
 *   - the seed catalogue covers at least one mixed-op + 3-5 total diffs
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  approveDiff,
  getProposedDiff,
  rejectDiff,
  SEED_DIFF_IDS,
  _seedDiffs,
} from './agent-diff-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('agent-diff-service', () => {
  it('exposes a seed catalogue of 3-5 diffs', () => {
    const seeds = _seedDiffs();
    expect(Object.keys(seeds).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(seeds).length).toBeLessThanOrEqual(5);
    expect(SEED_DIFF_IDS.length).toBe(Object.keys(seeds).length);
  });

  it('seed catalogue includes at least one mixed-op diff', () => {
    const seeds = _seedDiffs();
    const mixed = Object.values(seeds).find((diff) => {
      const ops = new Set(diff.items.map((i) => i.op));
      return ops.has('add') && ops.has('change') && ops.has('remove');
    });
    expect(mixed).toBeDefined();
  });

  it('getProposedDiff falls back to seed data when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const diff = await getProposedDiff('diff-seed-1', 'http://localhost:0');
    expect(diff).not.toBeNull();
    expect(diff?.id).toBe('diff-seed-1');
    expect(diff?.items.length).toBeGreaterThan(0);
  });

  it('getProposedDiff parses and returns the backend payload on success', async () => {
    const payload = {
      id: 'diff-remote-1',
      agent_id: 'agent-x',
      agent_name: 'Remote Agent',
      created_at_ms: 1_726_300_000_000,
      items: [
        {
          id: 'r-1',
          target: 'slide-1',
          target_kind: 'slide',
          op: 'change',
          before: { title: 'Old' },
          after: { title: 'New' },
          summary: 'Renamed slide.',
        },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    }) as unknown as typeof fetch;
    const diff = await getProposedDiff('diff-remote-1', 'http://api.test');
    expect(diff?.id).toBe('diff-remote-1');
    expect(diff?.agent_name).toBe('Remote Agent');
    expect(diff?.items[0]?.op).toBe('change');
  });

  it('getProposedDiff returns the parsed payload even for unknown ids on success', async () => {
    const payload = {
      id: 'diff-unknown',
      agent_id: 'a',
      agent_name: 'A',
      created_at_ms: 0,
      items: [],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    }) as unknown as typeof fetch;
    const diff = await getProposedDiff('diff-unknown', 'http://api.test');
    expect(diff?.id).toBe('diff-unknown');
    expect(diff?.items).toEqual([]);
  });

  it('getProposedDiff returns null only when seed is missing and fetch fails for an unknown id', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    // For an unknown id, the service falls back to seed-seed-1 (mixed).
    const diff = await getProposedDiff('totally-unknown', 'http://localhost:0');
    expect(diff).not.toBeNull();
    expect(diff?.id).toBe('diff-seed-1');
  });

  it('approveDiff returns the applied_at_ms from the backend', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ applied_at_ms: 1_726_302_000_000 }),
    }) as unknown as typeof fetch;
    const res = await approveDiff('diff-seed-1', 'http://api.test');
    expect(res.applied_at_ms).toBe(1_726_302_000_000);
  });

  it('approveDiff throws on a non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(approveDiff('diff-seed-1', 'http://api.test')).rejects.toThrow(/500/);
  });

  it('rejectDiff resolves on a 2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      json: async () => null,
    }) as unknown as typeof fetch;
    await expect(rejectDiff('diff-seed-1', 'http://api.test')).resolves.toBeUndefined();
  });

  it('rejectDiff throws on a non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(rejectDiff('diff-seed-1', 'http://api.test')).rejects.toThrow(/409/);
  });

  it('forwards the diff id (URL-encoded) on every call', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ applied_at_ms: 1 }),
    }) as unknown as typeof fetch;
    globalThis.fetch = mock;
    await approveDiff('diff/with spaces', 'http://api.test');
    const url = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(url).toContain('/v1/agent/diffs/diff%2Fwith%20spaces/approve');
  });
});