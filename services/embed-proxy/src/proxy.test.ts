/**
 * Proxy handler tests — covers valid token forwarding with
 * auth_passthrough, SSRF-blocked returns 400, invalid token returns 401,
 * expired token returns 401, and already-used token returns 401.
 */

import { describe, it, expect } from 'vitest';
import { proxyHandler, type ProxyHandlerContext } from './proxy.js';
import { EmbedTokenService } from './tokens.js';
import type { HttpRequest } from './types.js';

function makeCtx(overrides: Partial<ProxyHandlerContext> = {}) {
  const tokenService = new EmbedTokenService({
    ttlMs: 60_000,
    clock: () => 1000,
    generateToken: () => 'proxy-test-token',
  });
  return { tokenService, ...overrides };
}

function req(
  token: string,
  headers: Record<string, string | undefined> = {},
): HttpRequest<{ token: string }, undefined, Record<string, string | undefined>> {
  return {
    method: 'POST',
    path: '/v1/proxy/:token',
    params: { token },
    body: undefined,
    query: {},
    headers,
  };
}

describe('proxy — valid token forwards with auth_passthrough', () => {
  it('forwards request and returns upstream response', async () => {
    const ctx = makeCtx({
      fetchFn: async () => new Response(JSON.stringify({ data: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: 'ok' });
  });

  it('passes Authorization header through to upstream', async () => {
    let capturedHeaders: Record<string, string> = {};
    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response('ok', { status: 200 });
      },
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token', { authorization: 'Bearer secret-token' }), ctx);
    expect(capturedHeaders['authorization']).toBe('Bearer secret-token');
  });

  it('returns upstream non-200 status codes', async () => {
    const ctx = makeCtx({
      fetchFn: async () => new Response('upstream error', { status: 502 }),
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(502);
  });
});

describe('proxy — invalid token returns 401', () => {
  it('returns 401 for unknown token', async () => {
    const ctx = makeCtx();
    const response = await proxyHandler(req('nonexistent-token'), ctx);
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('INVALID_TOKEN');
  });

  it('returns 401 for already-used token', async () => {
    const ctx = makeCtx();
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    ctx.tokenService.consume('proxy-test-token'); // consume first
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('TOKEN_ALREADY_USED');
  });

  it('returns 401 for expired token', async () => {
    let now = 1000;
    const tokenService = new EmbedTokenService({
      ttlMs: 100,
      clock: () => now,
      generateToken: () => 'expiring-token',
    });
    tokenService.create('binding-1', 'https://api.example.com/data');
    now += 200; // expire
    const ctx = makeCtx({ tokenService });
    const response = await proxyHandler(req('expiring-token'), ctx);
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('TOKEN_EXPIRED');
  });
});

describe('proxy — SSRF-blocked returns 400', () => {
  it('returns 400 for localhost target URL', async () => {
    const tokenService = new EmbedTokenService({
      ttlMs: 60_000,
      clock: () => 1000,
      generateToken: () => 'ssrf-token',
    });
    tokenService.create('binding-1', 'https://localhost/admin');
    const ctx = makeCtx({ tokenService });
    const response = await proxyHandler(req('ssrf-token'), ctx);
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });

  it('returns 400 for metadata IP target URL', async () => {
    const tokenService = new EmbedTokenService({
      ttlMs: 60_000,
      clock: () => 1000,
      generateToken: () => 'metadata-token',
    });
    tokenService.create('binding-1', 'https://169.254.169.254/latest/meta-data');
    const ctx = makeCtx({ tokenService });
    const response = await proxyHandler(req('metadata-token'), ctx);
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });

  it('returns 400 for HTTP scheme target URL', async () => {
    const tokenService = new EmbedTokenService({
      ttlMs: 60_000,
      clock: () => 1000,
      generateToken: () => 'http-token',
    });
    tokenService.create('binding-1', 'http://example.com/data');
    const ctx = makeCtx({ tokenService });
    const response = await proxyHandler(req('http-token'), ctx);
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });

  it('returns 400 for RFC1918 IP target URL', async () => {
    const tokenService = new EmbedTokenService({
      ttlMs: 60_000,
      clock: () => 1000,
      generateToken: () => 'rfc1918-token',
    });
    tokenService.create('binding-1', 'https://192.168.1.1/admin');
    const ctx = makeCtx({ tokenService });
    const response = await proxyHandler(req('rfc1918-token'), ctx);
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });
});
