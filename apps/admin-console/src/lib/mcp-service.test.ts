/**
 * MCP service tests — Wave 10 §S10.1.
 *
 * Verifies the deterministic-seed fallback paths and the basic filter
 * semantics of `listMCPAudit`. We stub `fetch` so the tests don't
 * depend on a running backend.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMCPStatus,
  listMCPTools,
  listMCPAgents,
  rotateAgentToken,
  revokeAgent,
  listMCPAudit,
} from './mcp-service';

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

describe('mcp-service — getMCPStatus', () => {
  it('returns the upstream status on a 200 response', async () => {
    const remote = {
      running: true,
      version: '2.0.0',
      uptime_hours: 12,
      last_restarted_ms: 1_700_000_000_000,
      requests_per_min: 99,
    };
    mockFetchOnce(remote);
    const out = await getMCPStatus();
    expect(out).toEqual(remote);
  });

  it('falls back to seed when upstream returns 500', async () => {
    mockFetchOnce({ error: 'oops' }, { ok: false, status: 500 });
    const out = await getMCPStatus();
    expect(out.running).toBe(true);
    expect(typeof out.version).toBe('string');
    expect(out.version.length).toBeGreaterThan(0);
    expect(out.uptime_hours).toBeGreaterThan(0);
  });
});

describe('mcp-service — listMCPTools', () => {
  it('returns the upstream items when present', async () => {
    const remote = [
      {
        name: 'remote.tool',
        description: 'remote',
        params_schema: {},
        return_schema: {},
        rate_limit_class: 'low' as const,
        enabled: true,
      },
    ];
    mockFetchOnce({ items: remote });
    const out = await listMCPTools();
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('remote.tool');
  });

  it('falls back to 3-5 seeded tools when upstream errors', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPTools();
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const tool of out) {
      expect(['low', 'medium', 'high']).toContain(tool.rate_limit_class);
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.params_schema).toBe('object');
      expect(typeof tool.return_schema).toBe('object');
    }
  });

  it('falls back to seed when upstream returns an empty items list', async () => {
    mockFetchOnce({ items: [] });
    const out = await listMCPTools();
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});

describe('mcp-service — listMCPAgents', () => {
  it('returns 3-4 seeded agents on upstream error', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAgents();
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const a of out) {
      expect(['active', 'revoked']).toContain(a.status);
      expect(Array.isArray(a.scopes)).toBe(true);
    }
  });

  it('returns remote items when provided', async () => {
    const remote = [
      {
        agent_id: 'a-1',
        agent_name: 'A one',
        scopes: ['read-only'],
        token_last_rotated_ms: 1,
        status: 'active' as const,
      },
    ];
    mockFetchOnce({ items: remote });
    const out = await listMCPAgents();
    expect(out).toHaveLength(1);
    expect(out[0]?.agent_id).toBe('a-1');
  });
});

describe('mcp-service — rotateAgentToken', () => {
  it('updates token_last_rotated_ms and resets status to active', async () => {
    // Make sure fetch is a no-op stub so the rotation doesn't reach the
    // network.
    mockFetchOnce({}, { ok: false, status: 500 });
    await rotateAgentToken('agent-rehearsal-coach');
    const agents = await listMCPAgents();
    const rotated = agents.find((a) => a.agent_id === 'agent-rehearsal-coach');
    expect(rotated).toBeDefined();
    expect(rotated?.status).toBe('active');
    expect(rotated?.token_last_rotated_ms).toBeGreaterThan(0);
  });

  it('does not throw for an unknown agent id', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(rotateAgentToken('agent-does-not-exist')).resolves.toBeUndefined();
  });
});

describe('mcp-service — revokeAgent', () => {
  it('updates the agent status to revoked', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await revokeAgent('agent-deck-builder');
    const agents = await listMCPAgents();
    const revoked = agents.find((a) => a.agent_id === 'agent-deck-builder');
    expect(revoked?.status).toBe('revoked');
  });

  it('does not throw for an unknown agent id', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(revokeAgent('agent-does-not-exist')).resolves.toBeUndefined();
  });
});

describe('mcp-service — listMCPAudit', () => {
  it('returns 15-20 seeded entries spanning the last 24h', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit();
    expect(out.length).toBeGreaterThanOrEqual(15);
    expect(out.length).toBeLessThanOrEqual(20);
    // Every entry should have a 32-hex trace id and a timestamp within
    // the last 24h relative to the most-recent entry (the seed anchors
    // NOW internally so we can't use Date.now() here).
    const newest = out[0];
    expect(newest).toBeDefined();
    if (!newest) return;
    const upperBound = newest.timestamp_ms + 60_000; // 1m slack
    for (const e of out) {
      expect(e.timestamp_ms).toBeLessThanOrEqual(upperBound);
      expect(newest.timestamp_ms - e.timestamp_ms).toBeLessThanOrEqual(
        24 * 60 * 60 * 1000,
      );
      expect(e.trace_id.length).toBe(32);
    }
  });

  it('orders results most-recent first', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit();
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const curr = out[i];
      if (!prev || !curr) continue;
      expect(prev.timestamp_ms).toBeGreaterThanOrEqual(curr.timestamp_ms);
    }
  });

  it('covers multiple tools and varied status codes', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit();
    const tools = new Set(out.map((e) => e.tool));
    expect(tools.size).toBeGreaterThanOrEqual(3);
    const statuses = new Set(out.map((e) => e.result_status));
    expect(statuses.size).toBeGreaterThanOrEqual(2);
  });

  it('filters by agent_id', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit({ agentId: 'agent-researcher' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.agent_id === 'agent-researcher')).toBe(true);
  });

  it('filters by tool', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit({ tool: 'brand.check' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.tool === 'brand.check')).toBe(true);
  });

  it('filters by sinceMs', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const all = await listMCPAudit();
    const newest = all[0];
    expect(newest).toBeDefined();
    if (!newest) return;
    const cutoff = newest.timestamp_ms - 60 * 60_000; // 1h before newest
    const filtered = await listMCPAudit({ sinceMs: cutoff });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.timestamp_ms >= cutoff)).toBe(true);
  });

  it('returns empty list when filters exclude everything', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const out = await listMCPAudit({ agentId: 'agent-does-not-exist' });
    expect(out).toEqual([]);
  });
});
