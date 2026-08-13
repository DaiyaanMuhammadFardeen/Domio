/**
 * crm-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSyncStats } from './crm-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('crm-service', () => {
  it('returns the parsed stats on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        adapters: [
          {
            provider: 'HubSpot',
            status: 'healthy',
            last_run_ms: 1000,
            avg_duration_ms: 200,
          },
        ],
        idempotency_collisions_24h: 2,
        dlq_depth: 0,
      }),
    })) as unknown as typeof fetch;

    const stats = await fetchSyncStats('ws-demo', 'http://crm.test');
    expect(stats.adapters).toHaveLength(1);
    expect(stats.adapters[0]?.provider).toBe('HubSpot');
    expect(stats.idempotencyCollisions24h).toBe(2);
    expect(stats.dlqDepth).toBe(0);
  });

  it('returns empty stats on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const stats = await fetchSyncStats('ws-demo', 'http://crm.test');
    expect(stats.adapters).toEqual([]);
    expect(stats.dlqDepth).toBe(0);
  });

  it('returns empty stats on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const stats = await fetchSyncStats('ws-demo', 'http://crm.test');
    expect(stats.adapters).toEqual([]);
  });
});
