/**
 * cohort-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchCohortMatrix,
  fetchKpis,
  saveKpi,
} from './cohort-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('cohort-service', () => {
  it('fetchCohortMatrix returns the matrix on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        matrix: {
          weeks: 4,
          rows: [
            { joinWeek: '2025-W14', size: 100, retention: [1.0, 0.6, 0.4, 0.3] },
          ],
        },
      }),
    })) as unknown as typeof fetch;

    const matrix = await fetchCohortMatrix('ws-demo', { baseUrl: 'http://wh.test' });
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.weeks).toBe(4);
    expect(matrix.rows[0]?.retention[1]).toBe(0.6);
  });

  it('fetchCohortMatrix returns an empty matrix on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const matrix = await fetchCohortMatrix('ws-demo', { baseUrl: 'http://wh.test' });
    expect(matrix.rows).toEqual([]);
  });

  it('fetchKpis returns saved KPI definitions', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        kpis: [{ id: 'k-1', title: 'CTR', metric: 'completion_rate', aggregation: 'avg' }],
      }),
    })) as unknown as typeof fetch;

    const kpis = await fetchKpis('ws-demo', { baseUrl: 'http://wh.test' });
    expect(kpis).toHaveLength(1);
    expect(kpis[0]?.title).toBe('CTR');
  });

  it('saveKpi POSTs and returns the canonical KPI', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        kpi: {
          id: 'k-2',
          title: 'Banner CTR',
          metric: 'sessions',
          aggregation: 'sum',
          value: 1234,
        },
      }),
    })) as unknown as typeof fetch;

    const kpi = await saveKpi(
      'ws-demo',
      { title: 'Banner CTR', metric: 'sessions', aggregation: 'sum' },
      { baseUrl: 'http://wh.test' },
    );
    expect(kpi.id).toBe('k-2');
    expect(kpi.value).toBe(1234);
  });

  it('saveKpi throws on non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      saveKpi(
        'ws-demo',
        { title: 'x', metric: 'sessions', aggregation: 'sum' },
        { baseUrl: 'http://wh.test' },
      ),
    ).rejects.toThrow(/400/);
  });
});