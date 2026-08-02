/**
 * Server integration tests — covers publish→install, license, marketplace,
 * templates, icons, error mapping, and header passthrough.
 *
 * Uses InMemoryStore via defaultDeps so no Postgres required.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { buildApp } from '../server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(): ServiceDeps {
  const store = new InMemoryStore();
  return defaultDeps(store);
}

let app: ReturnType<typeof buildApp>;
let deps: ServiceDeps;

beforeAll(() => {
  deps = makeDeps();
  app = buildApp(deps);
});

async function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': 'test-tenant',
      'x-user-id': 'test-user',
      ...headers,
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };
  return app.request(path, init);
}

async function reqRaw(method: string, path: string, body: ArrayBuffer, headers?: Record<string, string>): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      'content-type': 'application/octet-stream',
      'x-tenant-id': 'test-tenant',
      ...headers,
    },
    body,
  });
}

// ---------------------------------------------------------------------------
// Catalog routes
// ---------------------------------------------------------------------------

describe('Catalog routes', () => {
  const catalogId = 'test.button';
  const version = '1.0.0';

  it('PUT /v1/blobs then POST /v1/registry/packages (publish free component)', async () => {
    // 1. Store a blob first
    const blobBytes = new TextEncoder().encode('{"content":"hello"}');
    const blobRes = await reqRaw('POST', '/v1/blobs', blobBytes.buffer);
    expect(blobRes.status).toBe(201);
    const blobJson = await blobRes.json() as { sha256: string };
    expect(blobJson.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 2. Publish a package referencing that blob
    const pubRes = await req('POST', '/v1/registry/packages', {
      catalogId,
      version,
      kind: 'component',
      name: 'Test Button',
      description: 'A test button component',
      category: 'ui',
      files: { main: blobJson.sha256 },
    });
    expect(pubRes.status).toBe(201);
    const pubBody = await pubRes.json() as { pkg: { id: string; catalogId: string; version: string }; created: boolean };
    expect(pubBody.created).toBe(true);
    expect(pubBody.pkg.catalogId).toBe(catalogId);
    expect(pubBody.pkg.version).toBe(version);
  });

  it('GET /v1/registry/packages?q=button (search)', async () => {
    const res = await req('GET', '/v1/registry/packages?q=button');
    expect(res.status).toBe(200);
    const body = await res.json() as { packages: Array<{ catalogId: string }> };
    expect(body.packages.length).toBeGreaterThanOrEqual(1);
    expect(body.packages.some((p) => p.catalogId === catalogId)).toBe(true);
  });

  it('GET /v1/registry/packages/:catalogId (get latest)', async () => {
    const res = await req('GET', `/v1/registry/packages/${catalogId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { pkg: { version: string } };
    expect(body.pkg.version).toBe(version);
  });

  it('GET /v1/registry/packages/:catalogId?version=1.0.0 (get by version)', async () => {
    const res = await req('GET', `/v1/registry/packages/${catalogId}?version=${version}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { pkg: { version: string } };
    expect(body.pkg.version).toBe(version);
  });

  it('GET /v1/registry/packages/:catalogId/versions', async () => {
    const res = await req('GET', `/v1/registry/packages/${catalogId}/versions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { versions: string[] };
    expect(body.versions).toContain(version);
  });

  it('GET /v1/registry/packages/:catalogId/variants', async () => {
    const res = await req('GET', `/v1/registry/packages/${catalogId}/variants`);
    expect(res.status).toBe(200);
    const body = await res.json() as { variants: Array<{ id: string; label: string }> };
    expect(body.variants).toBeDefined();
    expect(Array.isArray(body.variants)).toBe(true);
  });

  it('POST /v1/registry/packages/:catalogId/install (free package)', async () => {
    const res = await req('POST', `/v1/registry/packages/${catalogId}/install`, {
      version,
      pinMode: 'pin-version',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { version: string; bundleUrls: Array<{ name: string }>; updated?: boolean };
    expect(body.version).toBe(version);
    expect(body.bundleUrls.length).toBeGreaterThanOrEqual(1);
    expect(body.bundleUrls[0]!.name).toBe('main');
  });

  it('GET /v1/blobs/:sha256 (retrieve blob with hash verification)', async () => {
    const blobBytes = new TextEncoder().encode('{"content":"hello"}');
    const blobRes = await reqRaw('POST', '/v1/blobs', blobBytes.buffer);
    const { sha256 } = await blobRes.json() as { sha256: string };

    const getRes = await app.request(`/v1/blobs/${sha256}`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('x-sha256')).toBe(sha256);
    const data = new Uint8Array(await getRes.arrayBuffer());
    expect(new TextDecoder().decode(data)).toBe('{"content":"hello"}');
  });
});

// ---------------------------------------------------------------------------
// Blob tamper rejection
// ---------------------------------------------------------------------------

describe('Blob tamper rejection', () => {
  it('POST /v1/registry/packages rejects mismatched file hash', async () => {
    // Store a blob
    const blobBytes = new TextEncoder().encode('real content');
    const blobRes = await reqRaw('POST', '/v1/blobs', blobBytes.buffer);
    const { sha256: realHash } = await blobRes.json() as { sha256: string };

    // Publish with a different hash as the file reference
    const fakeHash = 'b'.repeat(64);
    const res = await req('POST', '/v1/registry/packages', {
      catalogId: 'test.tamper',
      version: '1.0.0',
      kind: 'component',
      name: 'Tamper Test',
      files: { main: fakeHash },
    });
    // Should fail because the fake hash blob doesn't exist
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBeDefined();
    void realHash;
  });
});

// ---------------------------------------------------------------------------
// Deprecate after publish
// ---------------------------------------------------------------------------

describe('Deprecate after publish', () => {
  const catalogId = 'test.deprecatable';
  const version = '1.0.0';

  it('publish then deprecate', async () => {
    // Publish
    const pubRes = await req('POST', '/v1/registry/packages', {
      catalogId,
      version,
      kind: 'component',
      name: 'Deprecatable',
    });
    expect(pubRes.status).toBe(201);

    // Deprecate
    const depRes = await req('POST', `/v1/registry/packages/${catalogId}/deprecate`, {
      reason: 'Superseded by v2',
    });
    expect(depRes.status).toBe(200);
    const body = await depRes.json() as { pkg: { deprecation: { reason: string } | null } };
    expect(body.pkg.deprecation).toBeDefined();
    expect(body.pkg.deprecation!.reason).toBe('Superseded by v2');
  });
});

// ---------------------------------------------------------------------------
// Marketplace routes
// ---------------------------------------------------------------------------

describe('Marketplace routes', () => {
  const catalogId = 'test.market';
  const version = '1.0.0';

  beforeAll(async () => {
    // Publish a component for the marketplace
    await req('POST', '/v1/registry/packages', {
      catalogId,
      version,
      kind: 'component',
      name: 'Market Component',
    });
  });

  it('POST /v1/marketplace/listings (create) → publish → review → search', async () => {
    // Create listing
    const createRes = await req('POST', '/v1/marketplace/listings', {
      catalogId,
      title: 'Test Market Component',
      description: 'A great marketplace component',
      priceCents: 499,
      tags: ['ui', 'button'],
    });
    expect(createRes.status).toBe(201);
    const { listing } = await createRes.json() as { listing: { id: string; status: string } };
    expect(listing.status).toBe('draft');

    // Publish
    const pubRes = await req('POST', `/v1/marketplace/listings/${listing.id}/publish`);
    expect(pubRes.status).toBe(200);
    const pubBody = await pubRes.json() as { listing: { status: string } };
    expect(pubBody.listing.status).toBe('published');

    // Get listing
    const getRes = await req('GET', `/v1/marketplace/listings/${listing.id}`);
    expect(getRes.status).toBe(200);

    // Submit review
    const reviewRes = await req('POST', `/v1/marketplace/listings/${listing.id}/reviews`, {
      rating: 5,
      body: 'Excellent component, works perfectly',
    });
    // Review may be auto-approved or queued for moderation
    expect([201, 202]).toContain(reviewRes.status);

    // List reviews
    const listReviewsRes = await req('GET', `/v1/marketplace/listings/${listing.id}/reviews`);
    expect(listReviewsRes.status).toBe(200);

    // Search
    const searchRes = await req('GET', '/v1/marketplace/search?q=market');
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json() as { items: Array<{ id: string }>; total: number };
    expect(searchBody.total).toBeGreaterThanOrEqual(1);
  });

  it('POST /v1/marketplace/purchases (record a sale)', async () => {
    const createRes = await req('POST', '/v1/marketplace/listings', {
      catalogId: 'test.sale-item',
      title: 'Sale Item',
      description: 'For sale',
      priceCents: 999,
      tags: ['sale'],
    });

    // We need a published listing for this; use the existing one
    const listRes = await req('GET', '/v1/marketplace/listings');
    const { listings } = await listRes.json() as { listings: Array<{ id: string }> };
    const listingId = listings[0]!.id;

    const purchaseRes = await req('POST', '/v1/marketplace/purchases', {
      listingId,
      sellerId: 'seller-1',
      workspaceId: 'test-tenant',
      currency: 'usd',
      grossCents: 499,
    });
    expect(purchaseRes.status).toBe(201);
    const body = await purchaseRes.json() as { revenueEvent: { grossCents: number; feeCents: number; netCents: number } };
    expect(body.revenueEvent.grossCents).toBe(499);
    expect(body.revenueEvent.feeCents).toBeGreaterThan(0);
    expect(body.revenueEvent.netCents).toBeLessThan(499);

    void createRes;
  });

  it('GET /v1/marketplace/payouts/eligibility', async () => {
    const res = await req('GET', '/v1/marketplace/payouts/eligibility?sellerId=seller-1&periodMonth=2026-01');
    expect(res.status).toBe(200);
    const body = await res.json() as { eligible: boolean; minPayoutCents: number };
    expect(typeof body.eligible).toBe('boolean');
    expect(typeof body.minPayoutCents).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// License routes
// ---------------------------------------------------------------------------

describe('License routes', () => {
  let listingId: string;

  beforeAll(async () => {
    // Publish a component
    await req('POST', '/v1/registry/packages', {
      catalogId: 'test.license-pkg',
      version: '1.0.0',
      kind: 'component',
      name: 'License Package',
    });

    // Create and publish a paid listing
    const createRes = await req('POST', '/v1/marketplace/listings', {
      catalogId: 'test.license-pkg',
      title: 'Paid License Package',
      description: 'Needs a license',
      priceCents: 1999,
      tags: ['paid'],
    });
    const { listing } = await createRes.json() as { listing: { id: string } };
    listingId = listing.id;
    await req('POST', `/v1/marketplace/listings/${listingId}/publish`);
  });

  it('POST /v1/license/grants (issue a grant) + POST /v1/license/verify', async () => {
    // Issue grant
    const grantRes = await req('POST', '/v1/license/grants', {
      catalogId: 'test.license-pkg',
      version: '1.0.0',
      listingId,
      seats: 3,
    });
    expect(grantRes.status).toBe(201);
    const grantBody = await grantRes.json() as { grantId: string; token: string; expiresAt: number };
    expect(grantBody.token).toBeDefined();
    expect(grantBody.expiresAt).toBeGreaterThan(0);

    // Verify token
    const verifyRes = await req('POST', '/v1/license/verify', {
      token: grantBody.token,
      catalogId: 'test.license-pkg',
      version: '1.0.0',
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json() as { valid: boolean; grant?: { id: string } };
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.grant).toBeDefined();
    expect(verifyBody.grant!.id).toBe(grantBody.grantId);
  });

  it('install paid package returns license token', async () => {
    const res = await req('POST', '/v1/registry/packages/test.license-pkg/install', {
      version: '1.0.0',
      pinMode: 'pin-version',
      seats: 1,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { version: string; licenseGrant?: { id: string; signedToken: string } };
    expect(body.version).toBe('1.0.0');
    // Paid listing should include a license grant
    expect(body.licenseGrant).toBeDefined();
    expect(body.licenseGrant!.signedToken).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe('Error mapping', () => {
  it('GET /v1/registry/packages/:catalogId returns 404 for missing package', async () => {
    const res = await req('GET', '/v1/registry/packages/does.notexist');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('ERR_NOT_FOUND');
    expect(body.error.message).toContain('not found');
  });

  it('POST /v1/registry/packages with invalid semver returns 400', async () => {
    const res = await req('POST', '/v1/registry/packages', {
      catalogId: 'test.bad-version',
      version: 'not-semver',
      kind: 'component',
      name: 'Bad Version',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ERR_VALIDATION');
  });

  it('GET /v1/blobs/:sha256 returns 404 for missing blob', async () => {
    const res = await app.request(`/v1/blobs/${'c'.repeat(64)}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('POST /v1/registry/packages returns 400 for invalid catalogId', async () => {
    const res = await req('POST', '/v1/registry/packages', {
      catalogId: 'INVALID CAPS!!!',
      version: '1.0.0',
      kind: 'component',
      name: 'Bad ID',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ERR_VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// x-tenant-id header passthrough
// ---------------------------------------------------------------------------

describe('x-tenant-id header passthrough', () => {
  it('install uses tenantId as workspaceId', async () => {
    // Publish a component
    await req('POST', '/v1/registry/packages', {
      catalogId: 'test.tenant-test',
      version: '1.0.0',
      kind: 'component',
      name: 'Tenant Test',
    });

    // Install with a specific tenant id header
    const res = await req('POST', '/v1/registry/packages/test.tenant-test/install', {
      version: '1.0.0',
      pinMode: 'pin-version',
    }, {
      'x-tenant-id': 'acme-corp',
      'x-user-id': 'user-42',
    });
    expect(res.status).toBe(200);

    // Verify the library item was stored with the correct workspaceId
    const item = await deps.store.getLibraryItem('user-42', 'acme-corp', 'test.tenant-test');
    expect(item).toBeDefined();
    expect(item!.workspaceId).toBe('acme-corp');
    expect(item!.userId).toBe('user-42');
  });
});

// ---------------------------------------------------------------------------
// Template routes
// ---------------------------------------------------------------------------

describe('Template routes', () => {
  let templateId: string;

  beforeAll(async () => {
    // Create a template in the store
    const id = 'tpl-test-001';
    await deps.store.putTemplate({
      id,
      kind: 'full_deck',
      name: 'Test Template',
      description: 'A test template',
      deckJson: {
        slides: [
          {
            elements: [
              { type: 'text', id: 'title', props: { label: 'Template Title', fontSize: 32 } },
            ],
          },
        ],
      },
      placeholders: [
        {
          id: 'ph-title',
          key: 'title',
          label: 'Title',
          kind: 'text',
          binding: 'slides[0].elements[0].props.label',
          required: true,
          default: 'Default Title',
        },
      ],
      authorId: 'system',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    templateId = id;
  });

  it('POST /v1/templates/install (install template with values)', async () => {
    const res = await req('POST', '/v1/templates/install', {
      templateId,
      values: { title: 'My Custom Title' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deck: Record<string, unknown>; manifest: Array<{ key: string; value: unknown }> };
    expect(body.deck).toBeDefined();
    expect(body.manifest.length).toBeGreaterThanOrEqual(1);
    expect(body.manifest[0]!.value).toBe('My Custom Title');
  });

  it('GET /v1/templates/:templateId/guided-order', async () => {
    const res = await req('GET', `/v1/templates/${templateId}/guided-order`);
    expect(res.status).toBe(200);
    const body = await res.json() as { placeholders: Array<{ id: string; required: boolean }> };
    expect(body.placeholders.length).toBeGreaterThanOrEqual(1);
    // Required placeholders come first
    const requiredIdx = body.placeholders.findIndex((p) => p.required);
    const optionalIdx = body.placeholders.findIndex((p) => !p.required);
    if (requiredIdx >= 0 && optionalIdx >= 0) {
      expect(requiredIdx).toBeLessThan(optionalIdx);
    }
  });

  it('GET /v1/templates/:templateId/preview', async () => {
    const res = await req('GET', `/v1/templates/${templateId}/preview`);
    expect(res.status).toBe(200);
    const body = await res.json() as { svg: string; width: number; height: number; frames: Array<{ slideIndex: number }> };
    expect(body.svg).toContain('<svg');
    expect(body.width).toBeGreaterThan(0);
    expect(body.frames.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Media routes — icons
// ---------------------------------------------------------------------------

describe('Media routes — icons', () => {
  it('POST /v1/media/icons/ingest → GET /v1/media/icons/search', async () => {
    // Ingest
    const ingestRes = await req('POST', '/v1/media/icons/ingest', {
      name: 'test-pin',
      synonyms: ['location', 'marker'],
      styles: ['outline'],
      pathData: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
      viewBox: '0 0 24 24',
    });
    expect(ingestRes.status).toBe(201);
    const ingestBody = await ingestRes.json() as { icon: { id: string; name: string; perceptualHash?: string } };
    expect(ingestBody.icon.name).toBe('test-pin');
    expect(ingestBody.icon.perceptualHash).toBeDefined();

    // Search
    const searchRes = await req('GET', '/v1/media/icons/search?q=pin');
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json() as { icons: Array<{ name: string }> };
    expect(searchBody.icons.length).toBeGreaterThanOrEqual(1);
    expect(searchBody.icons.some((i) => i.name === 'test-pin')).toBe(true);
  });

  it('POST /v1/media/icons/:iconId/recolor', async () => {
    // Ingest first
    const ingestRes = await req('POST', '/v1/media/icons/ingest', {
      name: 'test-recolor',
      pathData: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    });
    const { icon } = await ingestRes.json() as { icon: { id: string; pathData: string } };

    // Recolor
    const res = await req('POST', `/v1/media/icons/${icon.id}/recolor`, {
      color: '#ff0000',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { color: string; pathData: string };
    expect(body.color).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// Media routes — stickers
// ---------------------------------------------------------------------------

describe('Media routes — stickers', () => {
  beforeAll(async () => {
    // Create a sticker pack
    await deps.store.putStickerPack({
      id: 'pack-test-001',
      name: 'Test Stickers',
      theme: 'emoji',
      informalOnly: false,
      stickerComponentIds: ['comp-a', 'comp-b'],
      createdAt: Date.now(),
    });
  });

  it('GET /v1/media/stickers lists packs', async () => {
    const res = await req('GET', '/v1/media/stickers');
    expect(res.status).toBe(200);
    const body = await res.json() as { packs: Array<{ id: string; name: string }> };
    expect(body.packs.some((p) => p.id === 'pack-test-001')).toBe(true);
  });

  it('POST /v1/media/stickers/:packId/install', async () => {
    const res = await req('POST', '/v1/media/stickers/pack-test-001/install');
    expect(res.status).toBe(200);
    const body = await res.json() as { stickers: Array<{ catalogId: string; installed: boolean }> };
    expect(body.stickers.length).toBe(2);
    expect(body.stickers[0]!.catalogId).toBe('comp-a');
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('Health check', () => {
  it('GET /healthz returns ok', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
