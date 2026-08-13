/**
 * Handler tests (Phase 14 W1).
 *
 * Drives the public HTTP surface (handlers) through a single fixture
 * service and verifies status codes + bodies for each endpoint.
 */

import { describe, it, expect } from 'vitest';
import { ShareService } from '../src/service.js';
import { InMemoryShareStore } from '../src/store/mem_store.js';
import { InMemoryAuditEmitter } from '../src/audit/emit.js';
import { InMemoryNonceStore } from '@domio/signed-link-token';
import { handlers, type HttpRequest } from '../src/handlers.js';

const NOW = new Date('2026-08-06T12:00:00Z');
const TOKEN_KEY = new Uint8Array(32).fill(7);

function makeCtx() {
  const service = new ShareService({
    store: new InMemoryShareStore({ clock: () => NOW }),
    audit: new InMemoryAuditEmitter(),
    tokenKey: TOKEN_KEY,
    nonceStore: new InMemoryNonceStore(),
    clock: () => NOW,
  });
  return { service, ctx: { service } };
}

describe('handlers', () => {
  it('createShare → 201 with snapshot and token', async () => {
    const { ctx } = makeCtx();
    const req: HttpRequest<
      Record<string, never>,
      { workspaceId: string; deckId: string; actorId: string }
    > = {
      method: 'POST',
      path: '/v1/shares',
      params: {},
      body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
      query: {},
      headers: {},
    };
    const res = await handlers.createShare(req, ctx);
    expect(res.status).toBe(201);
    const body = res.body as { link: { id: string; shortId: string }; token: string };
    expect(body.link.id).toMatch(/^lnk_/);
    expect(body.link.shortId).toHaveLength(8);
    expect(body.token.split('.')).toHaveLength(4);
  });

  it('createShare rejects bad input with 400', async () => {
    const { ctx } = makeCtx();
    const req: HttpRequest<Record<string, never>, { workspaceId: ''; deckId: ''; actorId: '' }> = {
      method: 'POST',
      path: '/v1/shares',
      params: {},
      body: { workspaceId: '', deckId: '', actorId: '' },
      query: {},
      headers: {},
    };
    const res = await handlers.createShare(req, ctx);
    expect(res.status).toBe(400);
  });

  it('getShare returns 200 with snapshot', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    const res = await handlers.getShare(
      {
        method: 'GET',
        path: `/v1/shares/${linkId}`,
        params: { link_id: linkId },
        body: undefined,
        query: { workspaceId: 'w1' },
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { link: { id: string }; policy: { visibility: string } };
    expect(body.link.id).toBe(linkId);
    expect(body.policy.visibility).toBe('link_only'); // default
  });

  it('getShare returns 404 for missing link', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getShare(
      {
        method: 'GET',
        path: '/v1/shares/missing',
        params: { link_id: 'missing' },
        body: undefined,
        query: { workspaceId: 'w1' },
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('shareIntrospect returns 200 with claims', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const body = created.body as { link: { shortId: string }; token: string };
    const res = await handlers.shareIntrospect(
      {
        method: 'POST',
        path: '/mcp/share-introspect',
        params: {},
        body: { workspaceId: 'w1', shortId: body.link.shortId, token: body.token },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(200);
    const intro = res.body as { link_id: string; workspace_id: string };
    expect(intro.link_id).toMatch(/^lnk_/);
    expect(intro.workspace_id).toBe('w1');
  });

  it('shareIntrospect rejects replayed token with 400', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const body = created.body as { link: { shortId: string }; token: string };
    // First introspect succeeds.
    await handlers.shareIntrospect(
      {
        method: 'POST',
        path: '/mcp/share-introspect',
        params: {},
        body: { workspaceId: 'w1', shortId: body.link.shortId, token: body.token },
        query: {},
        headers: {},
      },
      ctx,
    );
    // Replay must fail.
    const res = await handlers.shareIntrospect(
      {
        method: 'POST',
        path: '/mcp/share-introspect',
        params: {},
        body: { workspaceId: 'w1', shortId: body.link.shortId, token: body.token },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('getPolicy returns 200 with the policy', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    const res = await handlers.getPolicy(
      {
        method: 'GET',
        path: `/v1/shares/${linkId}/policy`,
        params: { link_id: linkId },
        body: undefined,
        query: { workspaceId: 'w1' },
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { visibility: string }).visibility).toBe('link_only');
  });

  it('putPolicy updates visibility', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    const res = await handlers.putPolicy(
      {
        method: 'PUT',
        path: `/v1/shares/${linkId}/policy`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1', actorId: 'alice', visibility: 'public' },
        query: {},
        headers: { 'if-match': '2' },
      },
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { visibility: string }).visibility).toBe('public');
  });

  it('updateShare honors If-Match ETag and 409s on stale', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    // First update with seq=2 succeeds.
    const ok = await handlers.updateShare(
      {
        method: 'PATCH',
        path: `/v1/shares/${linkId}`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1', actorId: 'alice', slug: 'v2' },
        query: {},
        headers: { 'if-match': '2' },
      },
      ctx,
    );
    expect(ok.status).toBe(200);
    // Stale seq=2 must 409.
    const stale = await handlers.updateShare(
      {
        method: 'PATCH',
        path: `/v1/shares/${linkId}`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1', actorId: 'alice', slug: 'v3' },
        query: {},
        headers: { 'if-match': '2' },
      },
      ctx,
    );
    expect(stale.status).toBe(409);
  });

  it('revokeShare returns 200 and revoked link is gone', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    const res = await handlers.revokeShare(
      {
        method: 'DELETE',
        path: `/v1/shares/${linkId}`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1' },
        query: {},
        headers: { 'if-match': '2', 'x-actor-id': 'alice' },
      },
      ctx,
    );
    expect(res.status).toBe(200);
    const after = await handlers.getShare(
      {
        method: 'GET',
        path: `/v1/shares/${linkId}`,
        params: { link_id: linkId },
        body: undefined,
        query: { workspaceId: 'w1' },
        headers: {},
      },
      ctx,
    );
    expect(after.status).toBe(404);
  });

  it('rotateToken returns 200 with a fresh token', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string }; token: string }).link.id;
    const originalToken = (created.body as { token: string }).token;
    const res = await handlers.rotateToken(
      {
        method: 'POST',
        path: `/v1/shares/${linkId}/rotate-token`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1' },
        query: {},
        headers: { 'if-match': '2', 'x-actor-id': 'alice' },
      },
      ctx,
    );
    expect(res.status).toBe(200);
    const rotated = (res.body as { token: string }).token;
    expect(rotated).not.toBe(originalToken);
    expect(rotated.split('.')).toHaveLength(4);
  });

  it('extendExpiry returns 200 with the new expiry', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createShare(
      {
        method: 'POST',
        path: '/v1/shares',
        params: {},
        body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice' },
        query: {},
        headers: {},
      },
      ctx,
    );
    const linkId = (created.body as { link: { id: string } }).link.id;
    const future = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await handlers.extendExpiry(
      {
        method: 'POST',
        path: `/v1/shares/${linkId}/extend-expiry`,
        params: { link_id: linkId },
        body: { workspaceId: 'w1', actorId: 'alice', expiresAt: future },
        query: {},
        headers: { 'if-match': '2' },
      },
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { link: { expiresAt: string | null } }).link.expiresAt).toBe(future);
  });
});
