/**
 * living-service — tests for Wave 11 §S11.2.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listUpdates,
  listUpdatesWithSource,
  listSectionVersions,
  restoreSectionVersion,
  triggerRefresh,
  formatRelative,
  distinctKinds,
  lastUpdateMs,
  type LivingUpdate,
} from './living-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('living-service: listUpdates / listUpdatesWithSource', () => {
  it('returns parsed updates from a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        updates: [
          {
            id: 'u1',
            timestamp_ms: 1_700_000_000_000,
            kind: 'data_refresh',
            actor: { type: 'user', id: 'alice', name: 'Alice' },
            summary: 'Refreshed chart',
            section_id: 'sec-revenue',
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const updates = await listUpdates({ deckId: 'd-1' }, 'http://api.test');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.kind).toBe('data_refresh');
  });

  it('falls back to seed data when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.updates.length).toBeGreaterThanOrEqual(15);
    expect(result.updates.length).toBeLessThanOrEqual(20);
  });

  it('falls back to seed on non-2xx responses', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.updates.length).toBeGreaterThanOrEqual(15);
  });

  it('falls back when the response shape is malformed', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ foo: 'bar' }),
    })) as unknown as typeof fetch;

    const result = await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.updates.length).toBeGreaterThanOrEqual(15);
  });

  it('forwards sinceMs as a query param', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ updates: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await listUpdatesWithSource(
      { deckId: 'd-1', sinceMs: 1_700_000_000_000 },
      'http://api.test',
    );

    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('since_ms=1700000000000');
    expect(calledUrl.startsWith('http://api.test/v1/decks/d-1/updates?')).toBe(true);
  });

  it('omits query string when sinceMs is undefined', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ updates: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('http://api.test/v1/decks/d-1/updates');
  });

  it('filters seed entries by sinceMs', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const cutoff = Date.now() - 60 * 60_000;
    const result = await listUpdatesWithSource(
      { deckId: 'd-1', sinceMs: cutoff },
      'http://api.test',
    );
    expect(result.updates.every((u) => u.timestamp_ms >= cutoff)).toBe(true);
  });

  it('seed dataset spans the last 24h', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const now = Date.now();
    const result = await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    const dayAgo = now - 24 * 60 * 60_000;
    expect(result.updates.every((u) => u.timestamp_ms >= dayAgo)).toBe(true);
  });

  it('seed dataset includes all kinds and all actor types', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listUpdatesWithSource({ deckId: 'd-1' }, 'http://api.test');
    const kinds = new Set(result.updates.map((u) => u.kind));
    expect(kinds.has('data_refresh')).toBe(true);
    expect(kinds.has('comment_added')).toBe(true);
    expect(kinds.has('version_published')).toBe(true);
    expect(kinds.has('auto_refresh')).toBe(true);
    const actorTypes = new Set(result.updates.map((u) => u.actor.type));
    expect(actorTypes.has('system')).toBe(true);
    expect(actorTypes.has('user')).toBe(true);
    expect(actorTypes.has('agent')).toBe(true);
  });
});

describe('living-service: listSectionVersions', () => {
  it('returns parsed versions from a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        versions: [
          {
            id: 'v1',
            section_id: 'sec-x',
            timestamp_ms: 1_700_000_000_000,
            author: 'Alice',
            change_summary: 'Updated numbers',
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const versions = await listSectionVersions('d-1', 'sec-x', 'http://api.test');
    expect(versions).toHaveLength(1);
    expect(versions[0]?.author).toBe('Alice');
  });

  it('falls back to seed versions when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const versions = await listSectionVersions('d-1', 'sec-x', 'http://api.test');
    expect(versions.length).toBeGreaterThanOrEqual(4);
    expect(versions.length).toBeLessThanOrEqual(5);
    for (const v of versions) {
      expect(v.section_id).toBe('sec-x');
    }
  });

  it('falls back on non-2xx responses', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const versions = await listSectionVersions('d-1', 'sec-x', 'http://api.test');
    expect(versions.length).toBeGreaterThanOrEqual(4);
  });
});

describe('living-service: restoreSectionVersion', () => {
  it('returns restored_at_ms from a successful response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ restored_at_ms: 1_700_000_000_000 }),
    })) as unknown as typeof fetch;

    const result = await restoreSectionVersion('d-1', 'sec-x', 'v1', 'http://api.test');
    expect(result.restored_at_ms).toBe(1_700_000_000_000);
  });

  it('falls back to current time when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const before = Date.now();
    const result = await restoreSectionVersion('d-1', 'sec-x', 'v1', 'http://api.test');
    const after = Date.now();
    expect(result.restored_at_ms).toBeGreaterThanOrEqual(before);
    expect(result.restored_at_ms).toBeLessThanOrEqual(after);
  });

  it('falls back when response omits restored_at_ms', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;

    const before = Date.now();
    const result = await restoreSectionVersion('d-1', 'sec-x', 'v1', 'http://api.test');
    expect(result.restored_at_ms).toBeGreaterThanOrEqual(before);
  });
});

describe('living-service: triggerRefresh', () => {
  it('POSTs to the refresh endpoint and resolves on success', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await triggerRefresh('d-1', 'http://api.test');
    expect(mock).toHaveBeenCalledWith('http://api.test/v1/decks/d-1/refresh', { method: 'POST' });
  });

  it('resolves even when the network is down (optimistic UX)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    await expect(triggerRefresh('d-1', 'http://api.test')).resolves.toBeUndefined();
  });

  it('resolves on non-2xx responses', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    })) as unknown as typeof fetch;
    await expect(triggerRefresh('d-1', 'http://api.test')).resolves.toBeUndefined();
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000_000;

  it('returns "just now" for sub-minute diffs', () => {
    expect(formatRelative(now - 5_000, now)).toBe('just now');
  });
  it('formats minutes', () => {
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5m ago');
  });
  it('formats hours', () => {
    expect(formatRelative(now - 3 * 60 * 60_000, now)).toBe('3h ago');
  });
  it('formats days', () => {
    expect(formatRelative(now - 2 * 24 * 60 * 60_000, now)).toBe('2d ago');
  });
  it('never reports a negative diff when timestamp is in the future', () => {
    expect(formatRelative(now + 60_000, now)).toBe('just now');
  });
});

describe('distinctKinds', () => {
  it('returns unique kinds preserving order', () => {
    const updates: LivingUpdate[] = [
      { id: '1', timestamp_ms: 1, kind: 'data_refresh', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
      { id: '2', timestamp_ms: 2, kind: 'comment_added', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
      { id: '3', timestamp_ms: 3, kind: 'data_refresh', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
      { id: '4', timestamp_ms: 4, kind: 'auto_refresh', actor: { type: 'system', id: 's', name: 'S' }, summary: '' },
    ];
    expect(distinctKinds(updates)).toEqual(['data_refresh', 'comment_added', 'auto_refresh']);
  });
});

describe('lastUpdateMs', () => {
  it('returns undefined for empty input', () => {
    expect(lastUpdateMs([])).toBeUndefined();
  });
  it('returns the max timestamp_ms', () => {
    const updates: LivingUpdate[] = [
      { id: '1', timestamp_ms: 100, kind: 'data_refresh', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
      { id: '2', timestamp_ms: 500, kind: 'comment_added', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
      { id: '3', timestamp_ms: 250, kind: 'data_refresh', actor: { type: 'user', id: 'a', name: 'A' }, summary: '' },
    ];
    expect(lastUpdateMs(updates)).toBe(500);
  });
});