/**
 * element-heatmap-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchElementHeatmap, fetchElementTimeSeries } from './element-heatmap-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('element-heatmap-service', () => {
  it('fetchElementHeatmap returns the overlay on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        slideWidth: 960,
        slideHeight: 540,
        elements: [
          {
            id: 'el-a',
            label: 'CTA',
            kind: 'button',
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.1,
            attention: 0.6,
            attentionMs: 1000,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const result = await fetchElementHeatmap('ws-demo', 'deck-1', 'slide-1', {
      baseUrl: 'http://wh.test',
    });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.kind).toBe('button');
  });

  it('fetchElementHeatmap returns an empty overlay on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await fetchElementHeatmap('ws-demo', 'deck-1', 'slide-1', {
      baseUrl: 'http://wh.test',
    });
    expect(result.elements).toEqual([]);
  });

  it('fetchElementHeatmap forwards deck + slide ids in the URL', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ elements: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchElementHeatmap('ws-demo', 'deck/with/slash', 'slide-1', {
      baseUrl: 'http://wh.test',
    });
    const url = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(url).toContain('deck_id=deck%2Fwith%2Fslash');
    expect(url).toContain('slide_id=slide-1');
  });

  it('fetchElementTimeSeries returns points on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        points: [
          { t: '2025-08-01T00:00:00Z', attention: 0.2 },
          { t: '2025-08-02T00:00:00Z', attention: 0.4 },
        ],
      }),
    })) as unknown as typeof fetch;

    const points = await fetchElementTimeSeries('ws-demo', 'el-a', {
      baseUrl: 'http://wh.test',
    });
    expect(points).toHaveLength(2);
    expect(points[1]?.attention).toBe(0.4);
  });

  it('fetchElementTimeSeries returns an empty array on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const points = await fetchElementTimeSeries('ws-demo', 'el-a', {
      baseUrl: 'http://wh.test',
    });
    expect(points).toEqual([]);
  });
});
