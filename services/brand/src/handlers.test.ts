/**
 * Brand service handler tests — exercises the REST surface against an
 * in-memory service.  Each test issues a request through the handler
 * and asserts on the HTTP status + body.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { handlers, type HttpRequest } from './handlers.js';
import { BrandService } from './service.js';
import {
  InMemoryBrandKitRepository,
  InMemoryBrandContextRepository,
  InMemoryBrandKitSubBrandRepository,
} from './dal.js';
import { BrandMetrics } from './metrics.js';
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
  const svc = new BrandService({
    kits: new InMemoryBrandKitRepository(),
    contexts: new InMemoryBrandContextRepository(),
    subBrands: new InMemoryBrandKitSubBrandRepository(),
    idGenerator: idGen,
  });
  const metrics = new BrandMetrics();
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

function fixtureKit(overrides: Partial<{
  orgId: string;
  name: string;
  scope: 'org' | 'workspace' | 'team';
  createdBy?: string;
}> = {}) {
  return {
    orgId: ORG,
    name: 'Acme',
    ownerOrgId: ORG,
    scope: 'org' as const,
    createdBy: ACTOR,
    logos: [
      {
        logoId: 'logo-1',
        kitId: 'unused',
        variant: 'light' as const,
        size: 'lg' as const,
        format: 'svg' as const,
        assetUrl: 'https://cdn.example/light.svg',
        contentHash: 'sha256-1',
        clearSpacePx: 24,
      },
    ],
    palettes: [
      {
        paletteId: 'p-1',
        kitId: 'unused',
        tokenIds: ['color.brand.primary'],
        cvSafe: true,
        hueSpacingDeg: 60,
      },
    ],
    ...overrides,
  };
}

describe('brand-service handlers — brand kits', () => {
  it('POST /v1/brands creates a kit', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createBrandKit(
      req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { kitId: string }).kitId).toMatch(/^[0-9A-Z]{27}$/);
  });

  it('POST /v1/brands 400s when no logos are supplied', async () => {
    const { ctx } = makeCtx();
    const fixture = fixtureKit();
    // Mutate after construction to satisfy the type that requires logos.
    const res = await handlers.createBrandKit(
      req('POST', '/v1/brands', { orgId: ORG }, { ...fixture, logos: [] } as never),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('BRAND_KIT_VALIDATION_ERROR');
  });

  it('GET /v1/brands lists kits for an org', async () => {
    const { ctx } = makeCtx();
    await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'A' })), ctx);
    await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'B' })), ctx);
    const res = await handlers.listBrandKits(
      req('GET', '/v1/brands', { orgId: ORG }, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { brandKits: unknown[] }).brandKits.length).toBe(2);
  });

  it('GET /v1/brands/:kitId 404s when missing', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getBrandKit(
      req('GET', '/v1/brands/:kitId', { orgId: ORG, kitId: '01H0000000000000000000000AB' }, undefined),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('POST /v1/brands/:kitId/publish + /archive', async () => {
    const { ctx, metrics } = makeCtx();
    const create = await handlers.createBrandKit(
      req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()),
      ctx,
    );
    const kitId = (create.body as { kitId: string }).kitId;
    const pub = await handlers.publishBrandKit(
      req('POST', '/v1/brands/:kitId/publish', { orgId: ORG, kitId }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(pub.status).toBe(200);
    const arc = await handlers.archiveBrandKit(
      req('POST', '/v1/brands/:kitId/archive', { orgId: ORG, kitId }, { reason: 'replaced' }, { actorId: ACTOR }),
      ctx,
    );
    expect(arc.status).toBe(200);
    expect(metrics.brandKitArchivedTotal).toBe(1);
  });

  it('PUT /v1/brands/:kitId 409s on a published kit', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.createBrandKit(
      req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()),
      ctx,
    );
    const kitId = (create.body as { kitId: string }).kitId;
    await handlers.publishBrandKit(
      req('POST', '/v1/brands/:kitId/publish', { orgId: ORG, kitId }, undefined, { actorId: ACTOR }),
      ctx,
    );
    const res = await handlers.updateBrandKit(
      req('PUT', '/v1/brands/:kitId', { orgId: ORG, kitId }, { name: 'Renamed', updatedBy: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('BRAND_KIT_IMMUTABLE');
  });
});

describe('brand-service handlers — sub-brand', () => {
  it('POST /v1/brands/sub-brands 409s on cycle', async () => {
    const { ctx, metrics } = makeCtx();
    const a = await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'A' })), ctx);
    const b = await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'B' })), ctx);
    const aId = (a.body as { kitId: string }).kitId;
    const bId = (b.body as { kitId: string }).kitId;
    await handlers.addSubBrand(
      req('POST', '/v1/brands/sub-brands', { orgId: ORG }, { parentKitId: aId, childKitId: bId, inheritanceType: 'extend' }, { actorId: ACTOR }),
      ctx,
    );
    const res = await handlers.addSubBrand(
      req('POST', '/v1/brands/sub-brands', { orgId: ORG }, { parentKitId: bId, childKitId: aId, inheritanceType: 'extend' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('SUB_BRAND_CYCLE');
    expect(metrics.subBrandCycleBlockedTotal).toBe(1);
  });

  it('GET /v1/brands/:kitId/relations lists children + parents', async () => {
    const { ctx } = makeCtx();
    const a = await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'A' })), ctx);
    const b = await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit({ name: 'B' })), ctx);
    const aId = (a.body as { kitId: string }).kitId;
    const bId = (b.body as { kitId: string }).kitId;
    await handlers.addSubBrand(
      req('POST', '/v1/brands/sub-brands', { orgId: ORG }, { parentKitId: aId, childKitId: bId, inheritanceType: 'extend' }, { actorId: ACTOR }),
      ctx,
    );
    const res = await handlers.listSubBrands(
      req('GET', '/v1/brands/:kitId/relations', { orgId: ORG, kitId: aId }, undefined),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { children: unknown[] }).children.length).toBe(1);
  });
});

describe('brand-service handlers — brand contexts', () => {
  it('POST + GET /v1/brands/contexts', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.createBrandContext(
      req('POST', '/v1/brands/contexts', { orgId: ORG }, { name: 'Workspace', createdBy: ACTOR }),
      ctx,
    );
    expect(create.status).toBe(201);
    const contextId = (create.body as { contextId: string }).contextId;
    const get = await handlers.getBrandContext(
      req('GET', '/v1/brands/contexts/:id', { orgId: ORG, contextId }, undefined),
      ctx,
    );
    expect(get.status).toBe(200);
  });

  it('POST /v1/brands/contexts/:id/active sets active kit', async () => {
    const { ctx, metrics } = makeCtx();
    const kit = await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()), ctx);
    const ctxCreate = await handlers.createBrandContext(
      req('POST', '/v1/brands/contexts', { orgId: ORG }, { name: 'Workspace', createdBy: ACTOR }),
      ctx,
    );
    const kitId = (kit.body as { kitId: string }).kitId;
    const contextId = (ctxCreate.body as { contextId: string }).contextId;
    const res = await handlers.setActiveBrandKit(
      req('POST', '/v1/brands/contexts/:id/active', { orgId: ORG, contextId }, { kitId }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(metrics.brandContextSwitchTotal).toBe(1);
  });
});

describe('brand-service handlers — extraction', () => {
  it('POST /v1/brands/extraction returns 202 + a job id', async () => {
    const { ctx, metrics } = makeCtx();
    const res = await handlers.startExtraction(
      req('POST', '/v1/brands/extraction', { orgId: ORG }, { url: 'https://example.com', createdBy: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(202);
    expect((res.body as { jobId: string }).jobId).toMatch(/^[0-9A-Z]{27}$/);
    expect(metrics.brandExtractionStartedTotal).toBe(1);
  });

  it('PATCH /v1/brands/extraction/:id updates progress', async () => {
    const { ctx, metrics } = makeCtx();
    const started = await handlers.startExtraction(
      req('POST', '/v1/brands/extraction', { orgId: ORG }, { url: 'https://example.com', createdBy: ACTOR }),
      ctx,
    );
    const jobId = (started.body as { jobId: string }).jobId;
    const patch = await handlers.updateExtraction(
      req('PATCH', '/v1/brands/extraction/:id', { orgId: ORG, jobId }, { status: 'completed', stages: ['colors'], confidenceScores: { colors: 0.9 } }),
      ctx,
    );
    expect(patch.status).toBe(200);
    expect((patch.body as { status: string }).status).toBe('completed');
    expect(metrics.brandExtractionLatencyMs.length).toBe(1);
  });
});

describe('brand-service handlers — ACL + audit', () => {
  it('rejects writes when authorize() throws', async () => {
    const { ctx: baseCtx } = makeCtx();
    const ctx = {
      ...baseCtx,
      authorize: () => {
        throw new Error('Forbidden');
      },
    };
    await expect(
      handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()), ctx),
    ).rejects.toThrow('Forbidden');
  });

  it('records audit events on writes', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.createBrandKit(req('POST', '/v1/brands', { orgId: ORG }, fixtureKit()), ctx);
    const events = await audit.listByOrg(ORG);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('brand.kit.create');
  });
});