/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { gqlRequest } from './client.js';
import { hashQuery, loadPersistedQueries } from './server.js';

describe('gqlRequest (persisted queries)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['NEXT_PUBLIC_DASHBOARD_URL'] = 'http://example.test';
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('sends sha256Hash extension for a named persisted query', async () => {
    const res = await gqlRequest<{ ok: boolean }>({
      name: 'OverviewKPI',
      variables: { workspaceId: 'w', fromMs: 0, toMs: 1 },
    });
    expect(res.data).toEqual({ ok: true });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.extensions.persistedQuery.sha256Hash).toMatchInlineSnapshot(
      `"1bf12deab9c81d1d5ef6da6dd0bd2e3a2ee7da0a4ec2e3a2ed8c7e0b8b3f4e70"`,
    );
  });

  it('hashes a raw query when no persisted name is provided', async () => {
    const raw = 'query { deckSummary { deckId } }';
    const res = await gqlRequest({ query: raw, variables: {} });
    expect(res.data).toEqual({ ok: true });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.extensions.persistedQuery.sha256Hash).toBe(hashQuery(raw));
  });

  it('throws when neither name, hash, nor query is provided', async () => {
    await expect(gqlRequest({ variables: {} })).rejects.toThrow(/provide/);
  });

  it('loadPersistedQueries exposes at least the 8 documented hashes', () => {
    const pq = loadPersistedQueries();
    const expected = [
      'OverviewKPI',
      'DeckSummary',
      'SlideBreakdown',
      'FunnelChart',
      'HeatmapTile',
      'AbTestResults',
      'TeamRollup',
      'LivePulse',
    ];
    for (const name of expected) {
      expect(pq[name]).toBeDefined();
      expect(pq[name]!.query.length).toBeGreaterThan(0);
    }
  });
});
