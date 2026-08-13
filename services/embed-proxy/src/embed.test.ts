/**
 * Embed handler tests — covers 200/400/401/404 scenarios for
 * token creation, validation, proxy forwarding (Phase 08),
 * and policy CRUD handlers (Phase 11).
 */

import { describe, it, expect } from 'vitest';
import {
  embedHandlers,
  policyHandlers,
  type EmbedHandlerContext,
  type PolicyHandlerContext,
} from './handlers.js';
import { EmbedTokenService } from './tokens.js';
import { EmbedPolicyService } from './policies.js';
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

function makePolicyCtx(): PolicyHandlerContext {
  return { policyService: new EmbedPolicyService() };
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
  headers: Record<string, string | undefined> = {},
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers };
}

// ---------------------------------------------------------------------------
// Phase 08 — embed handlers
// ---------------------------------------------------------------------------

describe('embed handlers — createToken', () => {
  it('POST /v1/embed/tokens — 200 creates token', async () => {
    const ctx = makeCtx();
    const response = await embedHandlers.createToken(
      req('POST', '/v1/embed/tokens', undefined, {
        bindingId: 'valid-binding',
        url: 'https://api.example.com/data',
      }),
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
      fetchFn: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
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

// ---------------------------------------------------------------------------
// Phase 11 — Policy CRUD handlers
// ---------------------------------------------------------------------------

describe('policy handlers — list', () => {
  it('GET /v1/embed_policies?workspace_id=... — 200 returns policies', async () => {
    const ctx = makePolicyCtx();
    ctx.policyService.create({ workspaceId: 'ws-1', name: 'Policy A' });
    ctx.policyService.create({ workspaceId: 'ws-1', name: 'Policy B' });
    ctx.policyService.create({ workspaceId: 'ws-2', name: 'Policy C' });

    const response = await policyHandlers.list(
      req('GET', '/v1/embed_policies', undefined, undefined, { workspace_id: 'ws-1' }),
      ctx,
    );
    expect(response.status).toBe(200);
    const body = response.body as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });

  it('GET /v1/embed_policies — 400 when workspace_id missing', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.list(
      req('GET', '/v1/embed_policies', undefined, undefined, {}),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('MISSING_WORKSPACE_ID');
  });

  it('GET /v1/embed_policies?workspace_id=... — 200 empty for unknown workspace', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.list(
      req('GET', '/v1/embed_policies', undefined, undefined, { workspace_id: 'ws-empty' }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((response.body as { items: unknown[] }).items).toEqual([]);
  });
});

describe('policy handlers — create', () => {
  it('POST /v1/embed_policies — 201 creates policy', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.create(
      req('POST', '/v1/embed_policies', undefined, {
        workspaceId: 'ws-1',
        name: 'New Policy',
        allowedOrigins: ['https://example.com'],
      }),
      ctx,
    );
    expect(response.status).toBe(201);
    const body = response.body as { id: string; name: string };
    expect(body.id).toBeDefined();
    expect(body.name).toBe('New Policy');
  });

  it('POST /v1/embed_policies — 400 on missing workspaceId', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.create(
      req('POST', '/v1/embed_policies', undefined, { name: 'Test' } as unknown as {
        workspaceId: string;
        name: string;
      }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('POLICY_VALIDATION_ERROR');
  });

  it('POST /v1/embed_policies — 400 on missing name', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.create(
      req('POST', '/v1/embed_policies', undefined, { workspaceId: 'ws-1', name: '' }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('POLICY_VALIDATION_ERROR');
  });

  it('POST /v1/embed_policies — 400 on invalid sandbox flags', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.create(
      req('POST', '/v1/embed_policies', undefined, {
        workspaceId: 'ws-1',
        name: 'Test',
        sandboxFlags: 'bad-flag',
      }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('POLICY_VALIDATION_ERROR');
  });
});

describe('policy handlers — get', () => {
  it('GET /v1/embed_policies/:id — 200 returns policy', async () => {
    const ctx = makePolicyCtx();
    const created = ctx.policyService.create({ workspaceId: 'ws-1', name: 'Test' });

    const response = await policyHandlers.get(
      req('GET', '/v1/embed_policies/:id', { id: created.id }, undefined),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((response.body as { id: string }).id).toBe(created.id);
  });

  it('GET /v1/embed_policies/:id — 404 for unknown ID', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.get(
      req('GET', '/v1/embed_policies/:id', { id: 'nonexistent' }, undefined),
      ctx,
    );
    expect(response.status).toBe(404);
  });
});

describe('policy handlers — update', () => {
  it('PUT /v1/embed_policies/:id — 200 updates policy', async () => {
    const ctx = makePolicyCtx();
    const created = ctx.policyService.create({ workspaceId: 'ws-1', name: 'Original' });

    const response = await policyHandlers.update(
      req('PUT', '/v1/embed_policies/:id', { id: created.id }, { name: 'Updated' }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((response.body as { name: string }).name).toBe('Updated');
  });

  it('PUT /v1/embed_policies/:id — 404 for unknown ID', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.update(
      req('PUT', '/v1/embed_policies/:id', { id: 'nonexistent' }, { name: 'X' }),
      ctx,
    );
    expect(response.status).toBe(404);
  });

  it('PUT /v1/embed_policies/:id — 400 on invalid sandbox flags', async () => {
    const ctx = makePolicyCtx();
    const created = ctx.policyService.create({ workspaceId: 'ws-1', name: 'Test' });

    const response = await policyHandlers.update(
      req('PUT', '/v1/embed_policies/:id', { id: created.id }, { sandboxFlags: 'bad' }),
      ctx,
    );
    expect(response.status).toBe(400);
  });
});

describe('policy handlers — delete', () => {
  it('DELETE /v1/embed_policies/:id — 204 deletes policy', async () => {
    const ctx = makePolicyCtx();
    const created = ctx.policyService.create({ workspaceId: 'ws-1', name: 'Test' });

    const response = await policyHandlers.delete(
      req('DELETE', '/v1/embed_policies/:id', { id: created.id }, undefined),
      ctx,
    );
    expect(response.status).toBe(204);
  });

  it('DELETE /v1/embed_policies/:id — 404 for unknown ID', async () => {
    const ctx = makePolicyCtx();
    const response = await policyHandlers.delete(
      req('DELETE', '/v1/embed_policies/:id', { id: 'nonexistent' }, undefined),
      ctx,
    );
    expect(response.status).toBe(404);
  });
});
