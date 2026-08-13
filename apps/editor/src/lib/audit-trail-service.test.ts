/**
 * audit-trail-service — tests for Wave 10 §S10.9.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listAuditEntries,
  listAuditEntriesWithSource,
  distinctAgents,
  distinctTools,
  formatRelative,
  rangeStartMs,
} from './audit-trail-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('audit-trail-service', () => {
  it('returns parsed entries from a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        entries: [
          {
            id: 'a1',
            timestamp_ms: 1_700_000_000_000,
            agent_id: 'agent-x',
            agent_name: 'Agent X',
            tool: 'create_slide',
            kind: 'agent_call',
            request: { deckId: 'd' },
            response: { id: 's1' },
            status: 200,
            latency_ms: 120,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const entries = await listAuditEntries({}, 'http://api.test');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.tool).toBe('create_slide');
  });

  it('falls back to seed data when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await listAuditEntriesWithSource({}, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.entries.length).toBeGreaterThanOrEqual(15);
    expect(result.entries.length).toBeLessThanOrEqual(20);
  });

  it('falls back to seed data on non-2xx responses', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await listAuditEntriesWithSource({}, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.entries.length).toBeGreaterThanOrEqual(15);
  });

  it('falls back when the response shape is not an object with entries', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ foo: 'bar' }),
    })) as unknown as typeof fetch;

    const result = await listAuditEntriesWithSource({}, 'http://api.test');
    expect(result.source).toBe('seed');
    expect(result.entries.length).toBeGreaterThanOrEqual(15);
  });

  it('forwards agentId, tool, sinceMs, kind as query params', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ entries: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await listAuditEntriesWithSource(
      {
        agentId: 'agent-x',
        tool: 'create_slide',
        sinceMs: 1_700_000_000_000,
        kind: 'human_edit',
      },
      'http://api.test',
    );

    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('agent_id=agent-x');
    expect(calledUrl).toContain('tool=create_slide');
    expect(calledUrl).toContain('since_ms=1700000000000');
    expect(calledUrl).toContain('kind=human_edit');
    expect(calledUrl.startsWith('http://api.test/v1/agents/audit?')).toBe(true);
  });

  it('omits the query string entirely when no filters are passed', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ entries: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await listAuditEntriesWithSource({}, 'http://api.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('http://api.test/v1/agents/audit');
  });

  it('omits kind=all from the query string', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ entries: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await listAuditEntriesWithSource({ kind: 'all' }, 'http://api.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain('kind=');
  });

  it('filters seed entries by agent_id', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource({ agentId: 'agent-slide-builder' }, 'http://api.test');
    expect(result.entries.every((e) => e.agent_id === 'agent-slide-builder')).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('filters seed entries by tool', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource({ tool: 'create_slide' }, 'http://api.test');
    expect(result.entries.every((e) => e.tool === 'create_slide')).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('filters seed entries by sinceMs', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource(
      { sinceMs: Date.now() - 60 * 60_000 },
      'http://api.test',
    );
    const cutoff = Date.now() - 60 * 60_000;
    expect(result.entries.every((e) => e.timestamp_ms >= cutoff)).toBe(true);
  });

  it('filters seed entries by kind=human_edit', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource({ kind: 'human_edit' }, 'http://api.test');
    expect(result.entries.every((e) => e.kind === 'human_edit')).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('filters seed entries by kind=agent_call', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource({ kind: 'agent_call' }, 'http://api.test');
    expect(result.entries.every((e) => e.kind === 'agent_call')).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('seed dataset includes both kinds and a mix of statuses', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await listAuditEntriesWithSource({}, 'http://api.test');
    const kinds = new Set(result.entries.map((e) => e.kind));
    expect(kinds.has('agent_call')).toBe(true);
    expect(kinds.has('human_edit')).toBe(true);
    const statuses = new Set(result.entries.map((e) => e.status));
    // We seeded at least one non-2xx entry (validate_deck → 422).
    const hasError = [...statuses].some((s) => s >= 400);
    expect(hasError).toBe(true);
  });

  it('seed dataset is deterministic for a fixed wall-clock instant', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const now = Date.now();
    const a = await listAuditEntriesWithSource({}, 'http://api.test');
    const b = await listAuditEntriesWithSource({}, 'http://api.test');
    // Latencies are deterministic per call (same seed) but the
    // timestamp_ms values shift with wall-clock; verify same set of IDs.
    const idsA = a.entries.map((e) => e.id).sort();
    const idsB = b.entries.map((e) => e.id).sort();
    expect(idsA).toEqual(idsB);
    void now;
  });
});

describe('distinctAgents / distinctTools', () => {
  const sample = [
    {
      id: '1',
      timestamp_ms: 0,
      agent_id: 'a',
      agent_name: 'A',
      tool: 't1',
      kind: 'agent_call' as const,
      request: {},
      response: {},
      status: 200,
      latency_ms: 10,
    },
    {
      id: '2',
      timestamp_ms: 0,
      agent_id: 'a',
      agent_name: 'A',
      tool: 't2',
      kind: 'agent_call' as const,
      request: {},
      response: {},
      status: 200,
      latency_ms: 10,
    },
    {
      id: '3',
      timestamp_ms: 0,
      agent_id: 'b',
      agent_name: 'B',
      tool: 't1',
      kind: 'human_edit' as const,
      request: {},
      response: {},
      status: 200,
      latency_ms: 10,
    },
  ];

  it('returns unique agents preserving order', () => {
    expect(distinctAgents(sample)).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
  });

  it('returns unique tools preserving order', () => {
    expect(distinctTools(sample)).toEqual(['t1', 't2']);
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000_000;
  it('formats sub-minute diffs in seconds', () => {
    expect(formatRelative(now - 5_000, now)).toBe('5s ago');
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
    expect(formatRelative(now + 60_000, now)).toBe('1s ago');
  });
});

describe('rangeStartMs', () => {
  const now = 1_700_000_000_000;
  it('returns 1h ago for "1h"', () => {
    expect(rangeStartMs('1h', now)).toBe(now - 60 * 60_000);
  });
  it('returns 24h ago for "24h"', () => {
    expect(rangeStartMs('24h', now)).toBe(now - 24 * 60 * 60_000);
  });
  it('returns 7d ago for "7d"', () => {
    expect(rangeStartMs('7d', now)).toBe(now - 7 * 24 * 60 * 60_000);
  });
  it('returns undefined for "all"', () => {
    expect(rangeStartMs('all', now)).toBeUndefined();
  });
});