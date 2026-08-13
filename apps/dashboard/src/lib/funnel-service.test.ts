/**
 * funnel-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFunnelReport, fetchWhyHypotheses } from './funnel-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('funnel-service', () => {
  it('returns the parsed funnel report on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        deck_id: 'deck-A',
        workspace_id: 'ws-1',
        steps: [
          { label: 'viewers', value: 1000 },
          { label: 'opened', value: 800 },
          { label: 'reached-slide-N', value: 400 },
          { label: 'converted', value: 120 },
        ],
        slides: [
          {
            slide_id: 's-1',
            index: 0,
            title: 'Cover',
            viewers: 1000,
            bounce_rate: 0.2,
            avg_dwell_ms: 5000,
          },
        ],
        weekly_cohort: [
          { week_start: '2026-07-27', viewers: 200, conversions: 24 },
          { week_start: '2026-08-03', viewers: 250, conversions: 30 },
        ],
      }),
    })) as unknown as typeof fetch;

    const report = await fetchFunnelReport('ws-1', 'deck-A', 'http://wh.test');
    expect(report).not.toBeNull();
    expect(report?.steps).toHaveLength(4);
    expect(report?.steps[0]?.value).toBe(1000);
    expect(report?.slides[0]?.slideId).toBe('s-1');
    expect(report?.weeklyCohort).toHaveLength(2);
  });

  it('returns null on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const report = await fetchFunnelReport('ws-1', 'deck-A', 'http://wh.test');
    expect(report).toBeNull();
  });

  it('returns null on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const report = await fetchFunnelReport('ws-1', 'deck-A', 'http://wh.test');
    expect(report).toBeNull();
  });

  it('requests the why? hypotheses for a slide', async () => {
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          slide_id: 's-1',
          summary: 'Slide 1 has high bounce because…',
          hypotheses: ['Cover slide too dense', 'Low-contrast CTA'],
        }),
      };
    });
    globalThis.fetch = mock as unknown as typeof fetch;

    const result = await fetchWhyHypotheses('ws-1', 'deck-A', 's-1', 'http://wh.test');
    expect(result?.slideId).toBe('s-1');
    expect(result?.hypotheses).toHaveLength(2);
  });

  it('returns null from fetchWhyHypotheses on a 5xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await fetchWhyHypotheses('ws-1', 'deck-A', 's-1', 'http://wh.test');
    expect(result).toBeNull();
  });
});
