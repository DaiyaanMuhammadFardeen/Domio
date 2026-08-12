/**
 * analytics-service — tests.
 *
 * Per Wave 1 §S1.2 acceptance: services ship with at least one test
 * that asserts the public shape.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOverviewKpis, fetchDeckSummary } from './analytics-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('analytics-service', () => {
  it('returns the empty KPIs on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const kpis = await fetchOverviewKpis('ws-demo', 'http://warehouse.test');
    expect(kpis.sessions.value).toBe(0);
    expect(kpis.viewers.series).toHaveLength(7);
  });

  it('aggregates rows into the KPIs', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [
          { session_count: 100, viewer_count: 400, avg_session_ms: 30000, completion_rate: 0.7 },
          { session_count: 200, viewer_count: 600, avg_session_ms: 20000, completion_rate: 0.5 },
        ],
      }),
    })) as unknown as typeof fetch;

    const kpis = await fetchOverviewKpis('ws-demo', 'http://warehouse.test');
    expect(kpis.sessions.value).toBe(300);
    expect(kpis.viewers.value).toBe(1000);
    expect(kpis.avgDwellMs.value).toBe(25000);
  });

  it('returns an empty row array on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const rows = await fetchDeckSummary('ws-demo', 'http://warehouse.test');
    expect(rows).toEqual([]);
  });

  it('forwards workspace_id as a query param', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rows: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchOverviewKpis('ws-xyz', 'http://warehouse.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('workspace_id=ws-xyz');
  });
});