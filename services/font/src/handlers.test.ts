/**
 * Font service handler tests.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { handlers, type HttpRequest } from './handlers.js';
import { FontService } from './service.js';
import { InMemoryFontAssetRepository } from './dal.js';
import { FontMetrics } from './metrics.js';
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
  const svc = new FontService({
    fonts: new InMemoryFontAssetRepository(),
    idGenerator: idGen,
  });
  const metrics = new FontMetrics();
  const audit = new InMemoryAuditRecorder(() => 'unused');
  return { svc, ctx: { service: svc, metrics, audit } as const, metrics, audit };
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

function baseUpload(overrides: Record<string, unknown> = {}) {
  return {
    kitId: 'kit-1',
    fileUrl: 'https://cdn.example/font.woff2',
    format: 'woff2' as const,
    weight: 400,
    subsets: ['latin'],
    glyphCoverage: { 'Basic Latin': 100 },
    sha256: 'a'.repeat(64),
    licenseStatus: 'permissive' as const,
    antiPiracyScore: 0.1,
    createdBy: ACTOR,
    ...overrides,
  };
}

describe('font-service handlers — upload', () => {
  it('POST /v1/fonts creates a font', async () => {
    const { ctx, metrics } = makeCtx();
    const res = await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload()),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(metrics.fontUploadedTotal).toBe(1);
  });

  it('POST /v1/fonts 400s on invalid sha256', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload({ sha256: 'short' })),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('POST /v1/fonts 409s on high anti-piracy score', async () => {
    const { ctx, metrics } = makeCtx();
    const res = await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload({ antiPiracyScore: 0.9 })),
      ctx,
    );
    expect(res.status).toBe(409);
    expect(metrics.fontLicenseBlockedTotal).toBe(1);
  });
});

describe('font-service handlers — read', () => {
  it('GET /v1/fonts requires kitId', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.listFonts(
      req('GET', '/v1/fonts', { orgId: ORG }, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('GET /v1/fonts lists by kit', async () => {
    const { ctx } = makeCtx();
    await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload({ kitId: 'kit-1' })),
      ctx,
    );
    const res = await handlers.listFonts(
      req('GET', '/v1/fonts', { orgId: ORG }, undefined, { kitId: 'kit-1' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { fonts: unknown[] }).fonts.length).toBe(1);
  });

  it('GET /v1/fonts/:fontId 404s when missing', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getFont(
      req('GET', '/v1/fonts/:fontId', { orgId: ORG, fontId: '01H0000000000000000000000AB' }, undefined),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe('font-service handlers — license + delete', () => {
  it('PATCH /v1/fonts/:fontId/license updates license', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload()),
      ctx,
    );
    const fontId = (create.body as { fontId: string }).fontId;
    const res = await handlers.updateLicense(
      req('PATCH', '/v1/fonts/:fontId/license', { orgId: ORG, fontId }, { licenseStatus: 'restricted' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { licenseStatus: string }).licenseStatus).toBe('restricted');
  });

  it('DELETE /v1/fonts/:fontId 204s', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.uploadFont(
      req('POST', '/v1/fonts', { orgId: ORG }, baseUpload()),
      ctx,
    );
    const fontId = (create.body as { fontId: string }).fontId;
    const res = await handlers.deleteFont(
      req('DELETE', '/v1/fonts/:fontId', { orgId: ORG, fontId }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(204);
  });
});

describe('font-service handlers — audit', () => {
  it('records audit events on writes', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.uploadFont(req('POST', '/v1/fonts', { orgId: ORG }, baseUpload()), ctx);
    const events = await audit.listByOrg(ORG);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('font.upload');
  });
});