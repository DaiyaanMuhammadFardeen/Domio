/**
 * Proxy handler tests — covers valid token forwarding with
 * auth_passthrough, SSRF-blocked returns 400, invalid token returns 401,
 * expired token returns 401, already-used token returns 401,
 * and Phase 11 policy integration (CSP, JWT, trap-focus).
 */

import { describe, it, expect } from 'vitest';
import { proxyHandler, type ProxyHandlerContext } from './proxy.js';
import { EmbedTokenService } from './tokens.js';
import { DEFAULT_POLICY, type EmbedPolicy } from './policies.js';
import { signJwt } from './jwt.js';
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
      fetchFn: async () =>
        new Response(JSON.stringify({ data: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
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

// ---------------------------------------------------------------------------
// Phase 11 — Policy integration tests
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-proxy-jwt-secret';

function makePolicy(
  overrides: Partial<
    Pick<
      EmbedPolicy,
      'allowedOrigins' | 'jwtRequired' | 'jwtAudience' | 'trapFocus' | 'sandboxFlags'
    >
  > = {},
): EmbedPolicy {
  return {
    ...DEFAULT_POLICY,
    ...overrides,
  };
}

describe('proxy — Phase 11: CSP headers', () => {
  it('adds Content-Security-Policy frame-ancestors header when policy is resolved', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({ allowedOrigins: ['https://app.example.com'], jwtRequired: false });

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      resolvePolicy: async () => policy,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token'), ctx);
    expect(capturedHeaders['Content-Security-Policy']).toBe(
      "frame-ancestors 'self' https://app.example.com",
    );
  });

  it('adds frame-ancestors none when policy has empty allowedOrigins', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({ allowedOrigins: [], jwtRequired: false });

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      resolvePolicy: async () => policy,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token'), ctx);
    expect(capturedHeaders['Content-Security-Policy']).toBe("frame-ancestors 'none'");
  });
});

describe('proxy — Phase 11: trap-focus header', () => {
  it('adds Focus-Trap: enabled header when trapFocus is true', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({
      trapFocus: true,
      allowedOrigins: ['https://example.com'],
      jwtRequired: false,
    });

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      resolvePolicy: async () => policy,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token'), ctx);
    expect(capturedHeaders['Focus-Trap']).toBe('enabled');
  });

  it('does not add Focus-Trap header when trapFocus is false', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({
      trapFocus: false,
      allowedOrigins: ['https://example.com'],
      jwtRequired: false,
    });

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      resolvePolicy: async () => policy,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token'), ctx);
    expect(capturedHeaders['Focus-Trap']).toBeUndefined();
  });
});

describe('proxy — Phase 11: JWT passthrough', () => {
  it('returns 401 when jwtRequired and no Authorization header', async () => {
    const policy = makePolicy({ jwtRequired: true, allowedOrigins: ['https://example.com'] });

    const ctx = makeCtx({
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('JWT_REQUIRED');
  });

  it('returns 401 when jwtRequired and Authorization is not Bearer', async () => {
    const policy = makePolicy({ jwtRequired: true, allowedOrigins: ['https://example.com'] });

    const ctx = makeCtx({
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(
      req('proxy-test-token', { authorization: 'Basic abc' }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('JWT_REQUIRED');
  });

  it('returns 401 when JWT signature is invalid', async () => {
    const policy = makePolicy({ jwtRequired: true, allowedOrigins: ['https://example.com'] });
    const badToken = signJwt({ sub: 'user-1' }, 'wrong-secret');

    const ctx = makeCtx({
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(
      req('proxy-test-token', { authorization: `Bearer ${badToken}` }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('JWT_INVALID');
  });

  it('returns 401 when JWT audience does not match', async () => {
    const policy = makePolicy({
      jwtRequired: true,
      jwtAudience: 'https://expected.example.com',
      allowedOrigins: ['https://example.com'],
    });
    const token = signJwt({ sub: 'user-1', aud: 'https://wrong.example.com' }, JWT_SECRET);

    const ctx = makeCtx({
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(
      req('proxy-test-token', { authorization: `Bearer ${token}` }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('JWT_INVALID');
  });

  it('allows request when JWT is valid and audience matches', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({
      jwtRequired: true,
      jwtAudience: 'https://expected.example.com',
      allowedOrigins: ['https://example.com'],
    });
    const token = signJwt({ sub: 'user-1', aud: 'https://expected.example.com' }, JWT_SECRET);

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
      },
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(
      req('proxy-test-token', { authorization: `Bearer ${token}` }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: 'ok' });
    expect(capturedHeaders['Content-Security-Policy']).toBe(
      "frame-ancestors 'self' https://example.com",
    );
  });

  it('allows request when jwtRequired is false (no JWT needed)', async () => {
    const policy = makePolicy({ jwtRequired: false, allowedOrigins: ['https://example.com'] });

    const ctx = makeCtx({
      fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(200);
  });

  it('skips JWT check when resolvePolicy returns null', async () => {
    const ctx = makeCtx({
      fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      resolvePolicy: async () => null,
      jwtSecret: JWT_SECRET,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await proxyHandler(req('proxy-test-token'), ctx);
    expect(response.status).toBe(200);
  });
});

describe('proxy — Phase 11: policy resolution integration', () => {
  it('still SSRF-guards when policy is resolved', async () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });

    const tokenService = new EmbedTokenService({
      ttlMs: 60_000,
      clock: () => 1000,
      generateToken: () => 'ssrf-policy-token',
    });
    tokenService.create('binding-1', 'https://localhost/admin');

    const ctx = makeCtx({
      tokenService,
      resolvePolicy: async () => policy,
      jwtSecret: JWT_SECRET,
    });
    const response = await proxyHandler(req('ssrf-policy-token'), ctx);
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });

  it('returns CSP and trap-focus headers together', async () => {
    let capturedHeaders: Record<string, string> = {};
    const policy = makePolicy({
      allowedOrigins: ['https://app.example.com'],
      trapFocus: true,
      jwtRequired: false,
    });

    const ctx = makeCtx({
      fetchFn: async (_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      resolvePolicy: async () => policy,
    });
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    await proxyHandler(req('proxy-test-token'), ctx);
    expect(capturedHeaders['Content-Security-Policy']).toBe(
      "frame-ancestors 'self' https://app.example.com",
    );
    expect(capturedHeaders['Focus-Trap']).toBe('enabled');
  });
});
