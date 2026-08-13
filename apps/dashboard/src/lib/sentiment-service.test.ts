/**
 * sentiment-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  classify,
  fetchCsat,
  fetchSentiment,
  rollup,
} from './sentiment-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('sentiment-service', () => {
  describe('classify', () => {
    it('classifies 0–6 as detractor, 7–8 as passive, 9–10 as promoter', () => {
      expect(classify(0)).toBe('detractor');
      expect(classify(6)).toBe('detractor');
      expect(classify(7)).toBe('passive');
      expect(classify(8)).toBe('passive');
      expect(classify(9)).toBe('promoter');
      expect(classify(10)).toBe('promoter');
    });
  });

  describe('rollup', () => {
    it('returns zeros for empty input', () => {
      const r = rollup([]);
      expect(r.total).toBe(0);
      expect(r.nps).toBe(0);
      expect(r.csatPct).toBe(0);
    });

    it('computes nps and csat from rows', () => {
      const r = rollup([
        { slideId: 's1', score: 10, answer: 'promoter' },
        { slideId: 's1', score: 9, answer: 'promoter' },
        { slideId: 's1', score: 8, answer: 'passive' },
        { slideId: 's1', score: 5, answer: 'detractor' },
      ]);
      expect(r.total).toBe(4);
      // 50% promoter, 25% passive, 25% detractor.
      // CSAT = (2+1)/4 = 75%; NPS = 50 - 25 = 25.
      expect(r.csatPct).toBe(75);
      expect(r.nps).toBe(25);
    });
  });

  describe('fetchSentiment', () => {
    it('returns series on a 200', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          series: [
            {
              slideId: 'slide-1',
              points: [{ date: '2025-08-01', score: 0.4, responses: 10 }],
            },
          ],
        }),
      })) as unknown as typeof fetch;
      const series = await fetchSentiment('ws-demo', 'deck-1', { baseUrl: 'http://wh.test' });
      expect(series).toHaveLength(1);
      expect(series[0]?.points[0]?.score).toBe(0.4);
    });

    it('returns empty array on 5xx', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })) as unknown as typeof fetch;
      const series = await fetchSentiment('ws-demo', 'deck-1', { baseUrl: 'http://wh.test' });
      expect(series).toEqual([]);
    });
  });

  describe('fetchCsat', () => {
    it('rolls up CSAT rows from the warehouse', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            { slideId: 's1', score: 10 },
            { slideId: 's1', score: 9 },
            { slideId: 's1', score: 4 },
          ],
        }),
      })) as unknown as typeof fetch;
      const data = await fetchCsat('ws-demo', { deckId: 'deck-1', baseUrl: 'http://wh.test' });
      expect(data.total).toBe(3);
      expect(data.promoter).toBe(2);
      expect(data.detractor).toBe(1);
      // 2 promoter / 3 - 1 detractor / 3 = 66.67 - 33.33 = 33.
      expect(data.nps).toBe(33);
    });

    it('returns empty breakdown on 5xx', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })) as unknown as typeof fetch;
      const data = await fetchCsat('ws-demo', { deckId: 'deck-1', baseUrl: 'http://wh.test' });
      expect(data.total).toBe(0);
    });
  });
});