/**
 * heatmap-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchHeatmap } from './heatmap-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('heatmap-service', () => {
  it('returns the cells on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tile: {
          cells: [
            { x: 0, y: 0, intensity: 0.4 },
            { x: 1, y: 0, intensity: 0.7 },
          ],
        },
      }),
    })) as unknown as typeof fetch;

    const cells = await fetchHeatmap('ws-demo', 'deck-1', 'slide-1', { baseUrl: 'http://wh.test' });
    expect(cells).toHaveLength(2);
    expect(cells[1]?.intensity).toBe(0.7);
  });

  it('returns an empty array on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const cells = await fetchHeatmap('ws-demo', 'deck-1', 'slide-1', { baseUrl: 'http://wh.test' });
    expect(cells).toEqual([]);
  });

  it('encodes deckId + slideId in the URL', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tile: { cells: [] } }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchHeatmap('ws-demo', 'deck/with/slash', 'slide-1', { baseUrl: 'http://wh.test' });
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    expect(calledUrl).toContain('deck%2Fwith%2Fslash');
    expect(calledUrl).toContain('/slides/slide-1/heatmap');
  });
});
