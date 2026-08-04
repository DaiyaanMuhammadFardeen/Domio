/**
 * Deep-link service — handler + service tests (Phase 10 M7).
 * Covers CRUD, resolve happy/error paths, scope filter, key
 * rotation, single-use enforcement.
 */

import { describe, expect, it } from 'vitest';
import { handlers, type HttpRequest } from './handlers.js';
import { DeepLinkService } from './service.js';
import {
  InMemoryDeepLinkRepository,
  InMemoryDeepLinkKeyRepository,
} from './dal.js';
import {
  type DeepLinkHandlerContext,
} from './handlers.js';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const DECK = '01H000000000000000000000D1';
const SLIDE_A = '01H000000000000000000000S1';
const FIXED_TIME = 1_700_000_000_000;

function makeService(clock: () => number = () => FIXED_TIME) {
  return new DeepLinkService({
    repo: new InMemoryDeepLinkRepository(),
    keys: new InMemoryDeepLinkKeyRepository(),
    clock,
  });
}

function ctxFor(service: DeepLinkService): DeepLinkHandlerContext {
  return { service };
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

describe('DeepLinkService — shorten', () => {
  it('creates a short link with a token and persists the record', async () => {
    const service = makeService();
    const result = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      path_stack: [SLIDE_A],
      var_snapshot: [
        { name: 'TIER', value: 'annual', visibility: 'deck_public', scope: 'deck' },
      ],
    });
    expect(result.id).toHaveLength(9);
    expect(result.token.length).toBeGreaterThan(20);
    expect(result.kid.startsWith('dlk_')).toBe(true);
    expect(result.viewer_scope).toBe('public');
  });

  it('strips server_only entries before signing', async () => {
    const service = makeService();
    const result = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      var_snapshot: [
        { name: 'TIER', value: 'annual', visibility: 'deck_public', scope: 'deck' },
        { name: 'SECRET', value: 'shh', visibility: 'server_only', scope: 'deck' },
      ],
    });
    const items = await service.list(TENANT, DECK);
    expect(items[0]!.payload.var_snapshot).toHaveLength(1);
    expect(items[0]!.payload.var_snapshot[0]!.name).toBe('TIER');
    expect(result.token.length).toBeGreaterThan(20);
  });

  it('rejects shorten with missing deck_id', async () => {
    const service = makeService();
    await expect(
      service.shorten({ tenant_id: TENANT, deck_id: '', slide_id: SLIDE_A }),
    ).rejects.toThrow();
  });
});

describe('DeepLinkService — resolve', () => {
  it('round-trips: shorten → resolve returns the original payload', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      scenario: 'bear',
    });
    const resolved = await service.resolve({
      tenant_id: TENANT,
      id: short.id,
      audience: 'viewer',
    });
    expect(resolved.payload.slide_id).toBe(SLIDE_A);
    expect(resolved.payload.scenario).toBe('bear');
    expect(resolved.payload.aud).toBe('viewer');
    expect(resolved.click_count).toBe(1);
  });

  it('rejects cross-tenant resolve with NotFound', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
    });
    await expect(
      service.resolve({ tenant_id: OTHER_TENANT, id: short.id, audience: 'viewer' }),
    ).rejects.toThrow();
  });

  it('rejects audience mismatch with DEEP_LINK_AUDIENCE_MISMATCH', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      audience: 'viewer',
    });
    await expect(
      service.resolve({ tenant_id: TENANT, id: short.id, audience: 'editor' }),
    ).rejects.toThrow();
  });

  it('rejects expired links with DEEP_LINK_EXPIRED', async () => {
    const clockState = { now: FIXED_TIME };
    const service = makeService(() => clockState.now);
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      ttl_seconds: 1,
    });
    clockState.now += 5_000; // advance past expiry
    await expect(
      service.resolve({ tenant_id: TENANT, id: short.id, audience: 'viewer' }),
    ).rejects.toThrow();
  });

  it('enforces single-use: second resolve fails', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      single_use: true,
    });
    await service.resolve({ tenant_id: TENANT, id: short.id, audience: 'viewer' });
    await expect(
      service.resolve({ tenant_id: TENANT, id: short.id, audience: 'viewer' }),
    ).rejects.toThrow();
  });
});

describe('DeepLinkService — stats / delete / list', () => {
  it('returns click_count, expiry, scope, and creation info', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      viewer_scope: 'tenant',
    });
    const stats = await service.stats(TENANT, short.id);
    expect(stats.click_count).toBe(0);
    expect(stats.viewer_scope).toBe('tenant');
    expect(stats.expires_at).toBeGreaterThan(FIXED_TIME);
  });

  it('lists links for a deck', async () => {
    const service = makeService();
    await service.shorten({ tenant_id: TENANT, deck_id: DECK, slide_id: SLIDE_A });
    await service.shorten({ tenant_id: TENANT, deck_id: DECK, slide_id: SLIDE_A });
    const items = await service.list(TENANT, DECK);
    expect(items).toHaveLength(2);
  });

  it('refuses cross-tenant delete', async () => {
    const service = makeService();
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
    });
    expect(await service.delete(OTHER_TENANT, short.id)).toBe(false);
    expect(await service.delete(TENANT, short.id)).toBe(true);
  });
});

describe('DeepLinkService — key rotation', () => {
  it('rotateKey issues a new kid', async () => {
    const service = makeService();
    const a = await service.rotateKey(TENANT, DECK);
    const b = await service.rotateKey(TENANT, DECK);
    expect(a.kid).not.toBe(b.kid);
  });

  it('tokens resolve across rotation (overlap window)', async () => {
    const clockState = { now: FIXED_TIME };
    const service = makeService(() => clockState.now);
    const short = await service.shorten({
      tenant_id: TENANT,
      deck_id: DECK,
      slide_id: SLIDE_A,
      ttl_seconds: 60 * 60 * 24 * 60,
    });
    // Force-rotate the key
    await service.rotateKey(TENANT, DECK);
    // Resolve must still succeed because the previous key is
    // still inside its overlap window.
    const resolved = await service.resolve({
      tenant_id: TENANT,
      id: short.id,
      audience: 'viewer',
    });
    expect(resolved.payload.slide_id).toBe(SLIDE_A);
  });
});

describe('HTTP handlers', () => {
  it('shortenHandler happy path returns 201 with id+token', async () => {
    const service = makeService();
    const ctx = ctxFor(service);
    const res = await handlers.shorten(
      req(
        'POST',
        '/v1/tenants/t1/decks/d1/deep-links/shorten',
        { tenantId: TENANT, deckId: DECK },
        { slide_id: SLIDE_A },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { id: string; token: string };
    expect(body.id).toBeTruthy();
    expect(body.token).toBeTruthy();
  });

  it('shortenHandler rejects missing slide_id with 400', async () => {
    const service = makeService();
    const res = await handlers.shorten(
      req(
        'POST',
        '/v1/tenants/t1/decks/d1/deep-links/shorten',
        { tenantId: TENANT, deckId: DECK },
        {},
        { tenant_id: TENANT },
      ),
      ctxFor(service),
    );
    expect(res.status).toBe(400);
  });

  it('statsHandler returns the record', async () => {
    const service = makeService();
    const short = await service.shorten({ tenant_id: TENANT, deck_id: DECK, slide_id: SLIDE_A });
    const res = await handlers.stats(
      req('GET', '/v1/tenants/t1/deep-links/x/stats', { tenantId: TENANT, id: short.id }, undefined),
      ctxFor(service),
    );
    expect(res.status).toBe(200);
    const body = res.body as { id: string; click_count: number };
    expect(body.id).toBe(short.id);
    expect(body.click_count).toBe(0);
  });

  it('deleteHandler returns 204', async () => {
    const service = makeService();
    const short = await service.shorten({ tenant_id: TENANT, deck_id: DECK, slide_id: SLIDE_A });
    const res = await handlers.delete(
      req('DELETE', '/v1/tenants/t1/deep-links/x', { tenantId: TENANT, id: short.id }, undefined),
      ctxFor(service),
    );
    expect(res.status).toBe(204);
  });
});