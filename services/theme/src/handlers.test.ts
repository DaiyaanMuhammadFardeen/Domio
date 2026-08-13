/**
 * Theme service handler tests — exercises the REST surface against an
 * in-memory service.  Each test issues a request through the handler
 * and asserts on the HTTP status + body.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { handlers, type HttpRequest } from './handlers.js';
import { ThemeService } from './service.js';
import {
  InMemoryTokenRepository,
  InMemoryTokenAliasRepository,
  InMemoryThemeRepository,
  InMemoryThemeVersionRepository,
  InMemoryThemeOverrideRepository,
  InMemoryThemeApplicationEventRepository,
} from './dal.js';
import { ThemeMetrics } from './metrics.js';
import { InMemoryAuditRecorder } from './audit.js';

const ORG = 'org-1';
const ACTOR = 'alice';

function makeCtx() {
  let counter = 0;
  const idGen = (): ULID => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return asULID(`${ts}${rand}`);
  };
  const svc = new ThemeService({
    tokens: new InMemoryTokenRepository(),
    aliases: new InMemoryTokenAliasRepository(),
    themes: new InMemoryThemeRepository(),
    themeVersions: new InMemoryThemeVersionRepository(),
    overrides: new InMemoryThemeOverrideRepository(),
    applications: new InMemoryThemeApplicationEventRepository(),
    idGenerator: idGen,
  });
  const metrics = new ThemeMetrics();
  const audit = new InMemoryAuditRecorder(() => 'unused');
  return {
    svc,
    ctx: { service: svc, metrics, audit } as const,
    metrics,
    audit,
  };
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

describe('theme-service handlers — tokens', () => {
  it('POST /v1/tokens creates a token', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createToken(
      req(
        'POST',
        '/v1/tokens',
        { orgId: ORG },
        {
          tokenId: 'color.brand.primary',
          group: 'color' as never,
          type: 'color',
          value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
  });

  it('POST /v1/tokens 400s on invalid format', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createToken(
      req(
        'POST',
        '/v1/tokens',
        { orgId: ORG },
        {
          tokenId: 'Invalid-Format',
          group: 'color' as never,
          type: 'color',
          value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('GET /v1/tokens lists tokens', async () => {
    const { ctx } = makeCtx();
    await handlers.createToken(
      req(
        'POST',
        '/v1/tokens',
        { orgId: ORG },
        {
          tokenId: 'color.brand.primary',
          group: 'color' as never,
          type: 'color',
          value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    const res = await handlers.listTokens(
      req('GET', '/v1/tokens', { orgId: ORG }, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { tokens: unknown[] }).tokens.length).toBe(1);
  });

  it('DELETE /v1/tokens/:id 409s when referenced', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
      createdBy: ACTOR,
    });
    await svc.createOverride({
      orgId: ORG,
      deckId: 'd',
      scope: { kind: 'slide', slideId: 's1' },
      tokensPartial: new Map([
        [
          'color.brand.primary',
          { type: 'color', value: { space: 'srgb', channels: [0.9, 0.1, 0.1], alpha: 1 } },
        ],
      ]),
      createdBy: ACTOR,
    });
    const res = await handlers.deleteToken(
      req('DELETE', '/v1/tokens/:id', { orgId: ORG, tokenId: 'color.brand.primary' }, undefined, {
        actorId: ACTOR,
      }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('TOKEN_REFERENCED');
  });

  it('DELETE /v1/tokens/:id 204s when unreferenced', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createToken({
      tokenId: 'color.unused',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
      createdBy: ACTOR,
    });
    const res = await handlers.deleteToken(
      req('DELETE', '/v1/tokens/:id', { orgId: ORG, tokenId: 'color.unused' }, undefined, {
        actorId: ACTOR,
      }),
      ctx,
    );
    expect(res.status).toBe(204);
  });
});

describe('theme-service handlers — aliases', () => {
  it('POST /v1/aliases 409s on cycle', async () => {
    const { ctx } = makeCtx();
    await handlers.createAlias(
      req(
        'POST',
        '/v1/aliases',
        { orgId: ORG },
        { aliasTokenId: 'a', targetTokenId: 'b' },
        { actorId: ACTOR },
      ),
      ctx,
    );
    const res = await handlers.createAlias(
      req(
        'POST',
        '/v1/aliases',
        { orgId: ORG },
        { aliasTokenId: 'b', targetTokenId: 'a' },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('TOKEN_ALIAS_CYCLE');
  });
});

describe('theme-service handlers — themes + apply', () => {
  it('POST /v1/themes creates a theme', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createTheme(
      req(
        'POST',
        '/v1/themes',
        { orgId: ORG },
        {
          name: 'Sunrise',
          kind: 'user',
          tokens: new Map([
            [
              'color.brand.primary',
              { type: 'color', value: { space: 'srgb', channels: [1, 0.5, 0], alpha: 1 } },
            ],
          ]),
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
  });

  it('POST /v1/themes/:id/apply produces ops + records latency metric', async () => {
    const { ctx, metrics } = makeCtx();
    const createRes = await handlers.createTheme(
      req(
        'POST',
        '/v1/themes',
        { orgId: ORG },
        {
          name: 'Sunrise',
          kind: 'user',
          tokens: new Map([
            [
              'color.brand.primary',
              { type: 'color', value: { space: 'srgb', channels: [1, 0.5, 0], alpha: 1 } },
            ],
          ]),
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    const themeId = (createRes.body as { themeId: string }).themeId;
    const res = await handlers.applyTheme(
      req(
        'POST',
        '/v1/themes/:id/apply',
        { orgId: ORG, themeId },
        {
          deckId: 'deck-1',
          actorId: ACTOR,
          deckElements: [
            {
              slideId: 's1',
              elementId: 'e1',
              tokenRef: 'color.brand.primary',
              currentResolved: null,
            },
          ],
        },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(metrics.themeAppliedTotal).toBe(1);
    expect(metrics.themeApplyLatencyMs.length).toBe(1);
  });
});

describe('theme-service handlers — overrides', () => {
  it('POST /v1/overrides + GET /v1/overrides', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.createOverride(
      req(
        'POST',
        '/v1/overrides',
        { orgId: ORG },
        {
          deckId: 'deck-1',
          scope: { kind: 'slide', slideId: 'slide-4' },
          tokensPartial: new Map(),
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(create.status).toBe(201);

    const list = await handlers.listOverrides(
      req('GET', '/v1/overrides', { orgId: ORG }, undefined, { deckId: 'deck-1' }),
      ctx,
    );
    expect(list.status).toBe(200);
    expect((list.body as { overrides: unknown[] }).overrides.length).toBe(1);
  });
});

describe('theme-service handlers — ACL + audit', () => {
  it('rejects writes when authorize() throws', async () => {
    const { ctx } = makeCtx();
    ctx.authorize = () => {
      throw new Error('Forbidden');
    };
    await expect(
      handlers.createToken(
        req(
          'POST',
          '/v1/tokens',
          { orgId: ORG },
          {
            tokenId: 'color.brand.primary',
            group: 'color' as never,
            type: 'color',
            value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
          },
          { actorId: ACTOR },
        ),
        ctx,
      ),
    ).rejects.toThrow('Forbidden');
  });

  it('records audit events on writes', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.createToken(
      req(
        'POST',
        '/v1/tokens',
        { orgId: ORG },
        {
          tokenId: 'color.brand.primary',
          group: 'color' as never,
          type: 'color',
          value: { type: 'color', value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 } },
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    const events = await audit.listByOrg(ORG);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('token.create');
  });
});
