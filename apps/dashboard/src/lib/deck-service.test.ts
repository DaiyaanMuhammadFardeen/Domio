/**
 * deck-service — tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchDecks, fetchDeckSummary, fetchSlideBreakdown } from './deck-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('deck-service', () => {
  it('maps the rows array into DeckSummaryRow objects', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [
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

  it('returns null when the summary deck is missing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rows: [] }),
    })) as unknown as typeof fetch;

    const summary = await fetchDeckSummary('ws-1', 'missing', 'http://wh.test');
    expect(summary).toBeNull();
  });

  it('returns the slide breakdown rows', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [
          { slide_id: 's-1', views: 50, unique_viewers: 30, avg_dwell_ms: 5000, bounce_rate: 0.1 },
        ],
      }),
    })) as unknown as typeof fetch;

    const slides = await fetchSlideBreakdown('ws-1', 'deck-A', 'http://wh.test');
    expect(slides).toHaveLength(1);
    expect(slides[0]?.slideId).toBe('s-1');
  });

  it('returns empty arrays on failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    expect(await fetchDecks('ws-1', 'http://wh.test')).toEqual([]);
    expect(await fetchSlideBreakdown('ws-1', 'deck-A', 'http://wh.test')).toEqual([]);
    expect(await fetchDeckSummary('ws-1', 'deck-A', 'http://wh.test')).toBeNull();
  });
});