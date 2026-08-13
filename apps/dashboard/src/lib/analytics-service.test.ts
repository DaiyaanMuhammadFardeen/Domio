/**
 * analytics-service — tests.
 *
 * Per Wave 1 §S1.2 acceptance: services ship with at least one test
 * that asserts the public shape.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOverviewKpis, fetchDecks, fetchDeckSummary } from './analytics-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('analytics-service', () => {
  it('parses the overview wire shape on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        sessions: 300,
        viewers: 1000,
        avg_dwell_ms: 25000,
        completion_rate: 0.7,
        sessions_delta: 4.2,
        viewers_delta: -1.8,
        avg_dwell_delta: 2.5,
        completion_delta: 0.6,
        sessions_series: [10, 20, 30, 40, 50, 60, 70],
        viewers_series: [11, 21, 31, 41, 51, 61, 71],
        avg_dwell_series: [12, 22, 32, 42, 52, 62, 72],
        completion_series: [13, 23, 33, 43, 53, 63, 73],
      }),
    })) as unknown as typeof fetch;

    const kpis = await fetchOverviewKpis('ws-demo', 'http://warehouse.test');
    expect(kpis.sessions.value).toBe(300);
    expect(kpis.viewers.value).toBe(1000);
    expect(kpis.avgDwellMs.value).toBe(25000);
    expect(kpis.completionRate.value).toBe(0.7);
    expect(kpis.sessions.series).toHaveLength(7);
  });

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

  it('returns empty decks on a 4xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not found' }),
    })) as unknown as typeof fetch;

    const decks = await fetchDecks('ws-demo', 'http://warehouse.test');
    expect(decks).toEqual([]);
  });

  it('maps deck wire rows to DeckSummaryRow', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        decks: [
          {
            workspace_id: 'ws-1',
            deck_id: 'deck-A',
            session_count: 100,
            viewer_count: 400,
            total_events: 2000,
            avg_session_ms: 30000,
            completion_rate: 0.7,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const decks = await fetchDecks('ws-1', 'http://wh.test');
    expect(decks).toHaveLength(1);
    expect(decks[0]?.deckId).toBe('deck-A');
    expect(decks[0]?.sessionCount).toBe(100);
  });

  it('returns null when deck summary is missing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ deck: null }),
    })) as unknown as typeof fetch;

    const summary = await fetchDeckSummary('ws-1', 'missing', 'http://wh.test');
    expect(summary).toBeNull();
  });

  it('returns null on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    expect(await fetchDeckSummary('ws-1', 'deck-A', 'http://wh.test')).toBeNull();
    expect(await fetchDecks('ws-1', 'http://wh.test')).toEqual([]);
    const kpis = await fetchOverviewKpis('ws-1', 'http://wh.test');
    expect(kpis.sessions.value).toBe(0);
  });

  it('forwards workspace_id as the workspaceId option', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ decks: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchDecks('ws-xyz', 'http://wh.test');
    const init = (mock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-workspace-id': 'ws-xyz' });
  });
});
