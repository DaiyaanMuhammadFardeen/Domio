/**
 * Embed handler tests — covers 200/400/401/404 scenarios for
 * token creation, validation, and proxy forwarding.
 */

import { describe, it, expect } from 'vitest';
import {
  embedHandlers,
  type EmbedHandlerContext,
} from './handlers.js';
import { EmbedTokenService } from './tokens.js';
import type { HttpRequest } from './types.js';

function makeCtx(overrides: Partial<EmbedHandlerContext> = {}) {
  const tokenService = new EmbedTokenService({
    ttlMs: 60_000,
    clock: () => 1000,
    generateToken: () => 'embed-test-token',
  });
  const resolveBinding = async (id: string) => {
    if (id === 'valid-binding') return { url: 'https://api.example.com/data' };
    return null;
  };
  return { tokenService, resolveBinding, ...overrides } as EmbedHandlerContext;
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers: {} };
}

describe('embed handlers — createToken', () => {
  it('POST /v1/embed/tokens — 200 creates token', async () => {
    const ctx = makeCtx();
    const response = await embedHandlers.createToken(
      req('POST', '/v1/embed/tokens', undefined, { bindingId: 'valid-binding', url: 'https://api.example.com/data' }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((response.body as { token: string }).token).toBe('embed-test-token');
    expect((response.body as { expiresAt: Date }).expiresAt).toBeDefined();
  });

  it('POST /v1/embed/tokens — 400 on missing fields', async () => {
    const ctx = makeCtx();
    const response = await embedHandlers.createToken(
      req('POST', '/v1/embed/tokens', undefined, { bindingId: '', url: '' }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('MISSING_FIELDS');
  });
});

describe('embed handlers — validateToken', () => {
  it('GET /v1/embed/tokens/:token — 200 for valid token', async () => {
    const ctx = makeCtx();
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    const response = await embedHandlers.validateToken(
      req('GET', '/v1/embed/tokens/:token', { token: 'embed-test-token' }, undefined),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((response.body as { bindingId: string }).bindingId).toBe('binding-1');
  });

  it('GET /v1/embed/tokens/:token — 401 for invalid token', async () => {
    const ctx = makeCtx();
    const response = await embedHandlers.validateToken(
      req('GET', '/v1/embed/tokens/:token', { token: 'nonexistent' }, undefined),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('INVALID_TOKEN');
  });

  it('GET /v1/embed/tokens/:token — 401 for expired token', async () => {
    let now = 1000;
    const tokenService = new EmbedTokenService({
      ttlMs: 100,
      clock: () => now,
      generateToken: () => 'expiring-embed-token',
    });
    tokenService.create('binding-1', 'https://api.example.com/data');
    now += 200;
    const ctx = makeCtx({ tokenService });
    const response = await embedHandlers.validateToken(
      req('GET', '/v1/embed/tokens/:token', { token: 'expiring-embed-token' }, undefined),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('TOKEN_EXPIRED');
  });

  it('GET /v1/embed/tokens/:token — 401 for already-used token', async () => {
    const ctx = makeCtx();
    ctx.tokenService.create('binding-1', 'https://api.example.com/data');
    ctx.tokenService.consume('embed-test-token');
    const response = await embedHandlers.validateToken(
      req('GET', '/v1/embed/tokens/:token', { token: 'embed-test-token' }, undefined),
      ctx,
    );
    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('TOKEN_ALREADY_USED');
  });
});

describe('embed handlers — proxy', () => {
  it('POST /v1/embed/:bindingId/proxy — 200 for valid binding', async () => {
    const ctx = makeCtx({
      fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    const response = await embedHandlers.proxy(
      req('POST', '/v1/embed/:bindingId/proxy', { bindingId: 'valid-binding' }, undefined),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('POST /v1/embed/:bindingId/proxy — 404 for unknown binding', async () => {
    const ctx = makeCtx();
    const response = await embedHandlers.proxy(
      req('POST', '/v1/embed/:bindingId/proxy', { bindingId: 'nonexistent' }, undefined),
      ctx,
    );
    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('POST /v1/embed/:bindingId/proxy — 400 for SSRF-blocked binding URL', async () => {
    const ctx = makeCtx({
      resolveBinding: async () => ({ url: 'https://localhost/admin' }),
    });
    const response = await embedHandlers.proxy(
      req('POST', '/v1/embed/:bindingId/proxy', { bindingId: 'ssrf-binding' }, undefined),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('SSRF_BLOCKED');
  });
});
