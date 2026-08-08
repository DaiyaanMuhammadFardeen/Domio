/**
 * Tests for the ClickHouse HTTP client parameterisation.
 *
 * We don't need a live ClickHouse to exercise the URL builder — the
 * URL is the only thing we want to verify here. The actual query
 * path is exercised in the integration tests.
 */
import { describe, it, expect } from 'vitest';
import { buildClickHouseClient } from './clickhouse.js';

describe('clickhouse client url builder', () => {
  it('encodes scalar params with the right ClickHouse syntax', async () => {
    let capturedUrl: string | undefined;
    const fakeFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response('{"x":1}\n', { status: 200 });
    }) as unknown as typeof fetch;
    const oldFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch;
    try {
      const client = buildClickHouseClient({
        clickhouseUrl: 'http://localhost:8123',
        clickhouseDb: 'domio',
        clickhouseUser: '',
        clickhousePassword: '',
        port: 3030,
        readOnly: false,
      });
      await client.query('SELECT {x:Int32}', { x: 42 });
      expect(capturedUrl).toBeDefined();
      const u = new URL(capturedUrl as string);
      expect(u.searchParams.get('query')).toBe('SELECT {x:Int32}');
      expect(u.searchParams.get('param_x')).toBe('42');
      expect(u.searchParams.get('database')).toBe('domio');
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch as typeof fetch;
    }
  });

  it('escapes single quotes in string params', async () => {
    let capturedUrl: string | undefined;
    const fakeFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const oldFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch;
    try {
      const client = buildClickHouseClient({
        clickhouseUrl: 'http://localhost:8123',
        clickhouseDb: '',
        clickhouseUser: '',
        clickhousePassword: '',
        port: 3030,
        readOnly: false,
      });
      await client.query("SELECT {s:String}", { s: "o'malley" });
      const u = new URL(capturedUrl as string);
      expect(u.searchParams.get('param_s')).toBe("'o\\'malley'");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch as typeof fetch;
    }
  });

  it('formats arrays using array literal syntax', async () => {
    let capturedUrl: string | undefined;
    const fakeFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const oldFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch;
    try {
      const client = buildClickHouseClient({
        clickhouseUrl: 'http://localhost:8123',
        clickhouseDb: '',
        clickhouseUser: '',
        clickhousePassword: '',
        port: 3030,
        readOnly: false,
      });
      await client.query('SELECT {xs:Array(String)}', { xs: ['a', 'b'] });
      const u = new URL(capturedUrl as string);
      expect(u.searchParams.get('param_xs')).toBe("['a','b']");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch as typeof fetch;
    }
  });

  it('propagates non-200 responses as ClickHouseError', async () => {
    const fakeFetch = (async () => new Response('table not found', { status: 404 })) as unknown as typeof fetch;
    const oldFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch;
    try {
      const client = buildClickHouseClient({
        clickhouseUrl: 'http://localhost:8123',
        clickhouseDb: '',
        clickhouseUser: '',
        clickhousePassword: '',
        port: 3030,
        readOnly: false,
      });
      await expect(client.query('SELECT 1')).rejects.toThrow(/table not found/);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = oldFetch as typeof fetch;
    }
  });
});
