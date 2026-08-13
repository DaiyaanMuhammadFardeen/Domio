/**
 * API Explorer service tests — Wave 10 §S10.3.
 */

import { describe, it, expect } from 'vitest';
import {
  executeRequest,
  formatAsCurl,
  listEndpoints,
  listSnippets,
  saveSnippet,
} from './api-explorer-service';

describe('listEndpoints', () => {
  it('returns 15+ endpoints', async () => {
    const eps = await listEndpoints();
    expect(eps.length).toBeGreaterThanOrEqual(15);
  });

  it('groups endpoints by Decks/Sessions/Analytics/Marketplace/MCP/Webhooks', async () => {
    const eps = await listEndpoints();
    const groups = new Set(eps.map((e) => e.group));
    for (const g of ['Decks', 'Sessions', 'Analytics', 'Marketplace', 'MCP', 'Webhooks']) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it('every endpoint has a valid HTTP method', async () => {
    const eps = await listEndpoints();
    for (const e of eps) {
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(e.method);
    }
  });

  it('every endpoint has a path starting with /v1/', async () => {
    const eps = await listEndpoints();
    for (const e of eps) {
      expect(e.path.startsWith('/v1/')).toBe(true);
    }
  });

  it('returns a fresh array each call (no shared mutation)', async () => {
    const a = await listEndpoints();
    a.pop();
    const b = await listEndpoints();
    expect(b.length).toBeGreaterThanOrEqual(15);
  });
});

describe('executeRequest', () => {
  it('returns a mock response when the backend is unreachable', async () => {
    const res = await executeRequest({
      method: 'GET',
      path: '/v1/decks',
      params: {},
      headers: {},
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
    expect(res.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof res.body).toBe('string');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('builds the request URL with query params', async () => {
    const res = await executeRequest({
      method: 'GET',
      path: '/v1/decks',
      params: { limit: '20' },
      headers: {},
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('substitutes path params like :id', async () => {
    const res = await executeRequest({
      method: 'GET',
      path: '/v1/decks/:id',
      params: { id: 'dk-001' },
      headers: {},
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body).toContain('dk-001');
  });

  it('attaches auth headers when auth is provided', async () => {
    const res = await executeRequest({
      method: 'GET',
      path: '/v1/decks',
      params: {},
      headers: {},
      auth: { kind: 'api_key', value: 'sk_test_123' },
    });
    expect(res.headers['x-auth-kind']).toBe('api_key');
  });

  it('handles all three auth kinds without throwing', async () => {
    for (const kind of ['api_key', 'oauth', 'mcp_token'] as const) {
      const res = await executeRequest({
        method: 'GET',
        path: '/v1/mcp/tools',
        params: {},
        headers: {},
        auth: { kind, value: 'tok' },
      });
      expect(res.headers['x-auth-kind']).toBe(kind);
    }
  });

  it('handles POST with a JSON body without throwing', async () => {
    const res = await executeRequest({
      method: 'POST',
      path: '/v1/decks',
      params: {},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hello' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('handles DELETE and returns a deletion-shaped body', async () => {
    const res = await executeRequest({
      method: 'DELETE',
      path: '/v1/decks/:id',
      params: { id: 'dk-009' },
      headers: {},
    });
    expect(res.body).toContain('deleted');
    expect(res.body).toContain('dk-009');
  });
});

describe('saveSnippet', () => {
  it('returns an id and stores the snippet in memory', async () => {
    const before = listSnippets().length;
    const { id } = await saveSnippet({
      name: 'list decks',
      endpoint: 'GET /v1/decks',
      request: { method: 'GET', path: '/v1/decks' },
      response: { status: 200 },
    });
    expect(id).toMatch(/^snip-/);
    const after = listSnippets().length;
    expect(after).toBe(before + 1);
  });

  it('round-trips the snippet payload', async () => {
    const { id } = await saveSnippet({
      name: 'round trip',
      endpoint: 'POST /v1/decks',
      request: { method: 'POST', path: '/v1/decks', body: { foo: 'bar' } },
    });
    const stored = listSnippets().find((s) => s.id === id);
    expect(stored).toBeDefined();
    expect(stored?.name).toBe('round trip');
  });
});

describe('formatAsCurl', () => {
  it('includes method, url, and headers', () => {
    const out = formatAsCurl({
      method: 'GET',
      url: 'https://api.domio.app/v1/decks',
      headers: { accept: 'application/json' },
    });
    expect(out).toContain('curl -X GET');
    expect(out).toContain('https://api.domio.app/v1/decks');
    expect(out).toContain('accept: application/json');
  });

  it('appends -d when a body is supplied', () => {
    const out = formatAsCurl({
      method: 'POST',
      url: 'https://api.domio.app/v1/decks',
      headers: { 'content-type': 'application/json' },
      body: '{"title":"x"}',
    });
    expect(out).toContain('-d');
    expect(out).toContain('{"title":"x"}');
  });

  it('skips body when it is empty or whitespace', () => {
    const out = formatAsCurl({
      method: 'GET',
      url: 'https://api.domio.app/v1/decks',
      headers: {},
      body: '   ',
    });
    expect(out).not.toContain('-d');
  });
});
