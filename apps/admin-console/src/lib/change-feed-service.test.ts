/**
 * Change-feed service tests — Wave 10 §S10.7.
 *
 * Covers:
 *   - listChangeFeed falls back to deterministic seed when upstream
 *     returns 404 or an error.
 *   - listChangeFeed respects the sinceMs lower bound.
 *   - replayChangeFeed filters the seed into the requested window.
 *   - Empty / invalid args return empty arrays without calling fetch.
 *   - isChangeFeedOpKind type-guard accepts known kinds and rejects others.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHANGE_FEED_OP_KINDS,
  isChangeFeedOpKind,
  listChangeFeed,
  replayChangeFeed,
  seedWindowEndMs,
  seedWindowStartMs,
  type ChangeFeedOp,
} from './change-feed-service';

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function mockFetchOnce(
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    const res: MockResponse = {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: async () => body,
    };
    return res as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('change-feed-service — listChangeFeed', () => {
  it('returns approximately 20 seed ops when fetch fails', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const ops = await listChangeFeed({ deckId: 'deck-1' });
    expect(ops.length).toBeGreaterThanOrEqual(18);
    expect(ops.length).toBeLessThanOrEqual(22);
    expect(ops.every((o) => o.deck_id === 'deck-1')).toBe(true);
  });

  it('encodes the deck id into the upstream path', async () => {
    const fetchSpy = mockFetchOnce({ ops: [] });
    await listChangeFeed({ deckId: 'deck/with spaces' });
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('/v1/decks/deck%2Fwith%20spaces/change-feed');
  });

  it('forwards since_ms when provided', async () => {
    const fetchSpy = mockFetchOnce({ ops: [] });
    await listChangeFeed({ deckId: 'deck-1', sinceMs: 12345 });
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('since_ms=12345');
  });

  it('returns seeds sorted newest-first', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const ops = await listChangeFeed({ deckId: 'deck-1' });
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1];
      const curr = ops[i];
      if (!prev || !curr) continue;
      expect(prev.timestamp_ms).toBeGreaterThanOrEqual(curr.timestamp_ms);
    }
  });

  it('exposes every declared op kind somewhere in the seed', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const ops = await listChangeFeed({ deckId: 'deck-1' });
    const present = new Set(ops.map((o) => o.kind));
    for (const k of CHANGE_FEED_OP_KINDS) {
      expect(present.has(k)).toBe(true);
    }
  });

  it('filters upstream response by sinceMs when present', async () => {
    const upstream: ChangeFeedOp[] = [
      {
        id: 'a',
        timestamp_ms: 100,
        kind: 'slide_create',
        actor: { type: 'user', id: 'u-1', name: 'U1' },
        deck_id: 'd-1',
        summary: 'old',
        payload: {},
      },
      {
        id: 'b',
        timestamp_ms: 200,
        kind: 'slide_create',
        actor: { type: 'user', id: 'u-1', name: 'U1' },
        deck_id: 'd-1',
        summary: 'new',
        payload: {},
      },
    ];
    mockFetchOnce({ ops: upstream });
    const ops = await listChangeFeed({ deckId: 'd-1', sinceMs: 150 });
    expect(ops.map((o) => o.id)).toEqual(['b']);
  });

  it('returns empty array for an empty deckId without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await listChangeFeed({ deckId: '' })).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('change-feed-service — replayChangeFeed', () => {
  it('returns an empty array when toMs is not strictly greater than fromMs', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await replayChangeFeed('d-1', 100, 100)).toEqual([]);
    expect(await replayChangeFeed('d-1', 200, 100)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('replays from the seed when fetch fails', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const end = seedWindowEndMs();
    const start = end - 4 * 60_000; // 4-minute window inside the seed
    const ops = await replayChangeFeed('deck-1', start, end);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((o) => o.timestamp_ms >= start && o.timestamp_ms < end)).toBe(true);
  });

  it('returns an empty array when upstream returns an empty replay', async () => {
    mockFetchOnce({ ops: [] });
    const end = seedWindowEndMs();
    const start = seedWindowStartMs();
    const ops = await replayChangeFeed('deck-1', start, end);
    expect(ops).toEqual([]);
  });

  it('returns seed slice when upstream returns 404 (falls back to seed)', async () => {
    mockFetchOnce({}, { ok: false, status: 404 });
    const end = seedWindowEndMs();
    const start = seedWindowStartMs();
    const ops = await replayChangeFeed('deck-1', start, end);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((o) => o.timestamp_ms >= start && o.timestamp_ms < end)).toBe(true);
  });

  it('does not call fetch for an empty deckId', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await replayChangeFeed('', 0, 1)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('change-feed-service — isChangeFeedOpKind', () => {
  it('accepts every declared op kind', () => {
    for (const k of CHANGE_FEED_OP_KINDS) {
      expect(isChangeFeedOpKind(k)).toBe(true);
    }
  });

  it('rejects unknown kinds', () => {
    expect(isChangeFeedOpKind('deck_deleted')).toBe(false);
    expect(isChangeFeedOpKind('')).toBe(false);
  });
});

describe('change-feed-service — seed window helpers', () => {
  it('has a 5-minute wide seed window', () => {
    expect(seedWindowEndMs() - seedWindowStartMs()).toBe(5 * 60_000);
  });
});
