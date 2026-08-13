/**
 * Takedown-service tests — Wave 9 §S9.6.
 *
 * Covers `getTakedown` (returns null on not-found / upstream error) and
 * `listTakedownEvents` (sorts by ascending timestamp_ms).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTakedown, listTakedownEvents } from './takedown-service';

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

describe('takedown-service — getTakedown', () => {
  it('returns the takedown on a 200 response', async () => {
    const fixture = {
      request_id: 'tk-1',
      listing_id: 'lst-1',
      claimant_id: 'u-1',
      kind: 'dmca' as const,
      evidence_url: 'https://example.com/evidence',
      statement: 'Infringing content',
      status: 'received' as const,
      resolution_notes: null,
      submitted_at: 1_700_000_000_000,
      resolved_at: null,
    };
    const fetchSpy = mockFetchOnce(fixture);
    const result = await getTakedown('tk-1');
    expect(result).toEqual(fixture);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('/v1/takedowns/tk-1');
  });

  it('returns null when the upstream returns 404', async () => {
    mockFetchOnce({}, { ok: false, status: 404 });
    expect(await getTakedown('missing')).toBeNull();
  });

  it('returns null when the upstream returns 500', async () => {
    mockFetchOnce({ error: 'oops' }, { ok: false, status: 500 });
    expect(await getTakedown('broken')).toBeNull();
  });

  it('returns null for an empty id without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getTakedown('')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('takedown-service — listTakedownEvents', () => {
  it('returns events sorted by ascending timestamp_ms', async () => {
    const events = [
      { id: 'e3', action: 'resolved' as const, actor: 'admin@domio.app', timestamp_ms: 1_700_000_300_000 },
      { id: 'e1', action: 'submitted' as const, actor: 'u-1', timestamp_ms: 1_700_000_100_000 },
      { id: 'e2', action: 'review_started' as const, actor: 'admin@domio.app', timestamp_ms: 1_700_000_200_000 },
    ];
    mockFetchOnce({ events });
    const out = await listTakedownEvents('tk-1');
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns an empty array when upstream returns 404', async () => {
    mockFetchOnce({}, { ok: false, status: 404 });
    expect(await listTakedownEvents('nope')).toEqual([]);
  });

  it('returns an empty array when payload has no events field', async () => {
    mockFetchOnce({});
    expect(await listTakedownEvents('tk-2')).toEqual([]);
  });

  it('returns an empty array for an empty id without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await listTakedownEvents('')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
