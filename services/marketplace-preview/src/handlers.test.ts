/**
 * Marketplace preview REST handler tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { asULID } from '@domio/schema';
import { InMemoryMarketplaceRepository, type ThemeBundle } from './dal.js';
import { MarketplacePreviewService } from './service.js';
import { MarketplaceMetrics } from './metrics.js';
import { InMemoryMarketplaceAuditRecorder } from './audit.js';
import {
  createListingHandler,
  publishListingHandler,
  installThemeHandler,
  setFeaturedHandler,
  certifyA11yHandler,
  type MarketplaceHandlerContext,
} from './handlers.js';

const ORG = 'org-1';
const ACTOR = 'user-1';
let counter = 0;
const idGen = () => {
  counter++;
  return asULID(`01H0000000000000000${counter.toString().padStart(7, '0')}`);
};

const BUNDLE: ThemeBundle = {
  schemaVersion: '1.0.0',
  brandKitDraft: { name: 'Acme' },
  themes: [{ name: 'Acme Light' }],
  assets: [
    {
      assetId: 'font-1',
      kind: 'font',
      name: 'Acme Sans',
      licenseStatus: 'permissive',
      contentHash: 'a'.repeat(64),
    },
  ],
};

let service: MarketplacePreviewService;
let metrics: MarketplaceMetrics;
let audit: InMemoryMarketplaceAuditRecorder;
let ctx: MarketplaceHandlerContext;

beforeEach(() => {
  counter = 0;
  service = new MarketplacePreviewService({
    repository: new InMemoryMarketplaceRepository(),
    idGenerator: idGen,
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  metrics = new MarketplaceMetrics();
  audit = new InMemoryMarketplaceAuditRecorder(idGen, () => new Date('2026-01-01T00:00:00.000Z'));
  ctx = { service, metrics, audit, resolveActorId: () => ACTOR };
});

async function createViaHandler() {
  return createListingHandler(
    {
      method: 'POST',
      path: '/v1/marketplace/listings',
      params: {},
      body: {
        sellerOrgId: ORG,
        name: 'Acme Theme',
        description: 'Description',
        bundle: BUNDLE,
      },
      query: {},
      headers: {},
    },
    ctx,
  );
}

describe('marketplace preview handlers', () => {
  it('creates a listing, emits metrics, and records audit', async () => {
    const res = await createViaHandler();
    expect(res.status).toBe(201);
    expect(metrics.snapshot().listingCreatedTotal).toBe(1);
    const events = await audit.listByOrg(ORG);
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('marketplace.listing.create');
  });

  it('returns 401 when create has no actor', async () => {
    const noAuth = { ...ctx, resolveActorId: () => undefined };
    const res = await createListingHandler(
      {
        method: 'POST',
        path: '/v1/marketplace/listings',
        params: {},
        body: {
          sellerOrgId: ORG,
          name: 'Acme Theme',
          description: '',
          bundle: BUNDLE,
        },
        query: {},
        headers: {},
      },
      noAuth,
    );
    expect(res.status).toBe(401);
  });

  it('returns 409 when featuring an uncertified listing', async () => {
    const created = await createViaHandler();
    const listingId = (created.body as { listingId: string }).listingId;
    const res = await setFeaturedHandler(
      {
        method: 'POST',
        path: `/v1/marketplace/listings/${listingId}/feature`,
        params: { listingId },
        body: { featured: true },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('THEME_A11Y_CERTIFICATION_REQUIRED');
  });

  it('certifies and features a listing', async () => {
    const created = await createViaHandler();
    const listingId = (created.body as { listingId: string }).listingId;
    const cert = await certifyA11yHandler(
      {
        method: 'POST',
        path: `/v1/marketplace/listings/${listingId}/certify`,
        params: { listingId },
        body: { passed: true },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(cert.status).toBe(200);
    const feature = await setFeaturedHandler(
      {
        method: 'POST',
        path: `/v1/marketplace/listings/${listingId}/feature`,
        params: { listingId },
        body: { featured: true },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(feature.status).toBe(200);
    expect((feature.body as { featured: boolean }).featured).toBe(true);
  });

  it('returns 409 for a tampered install hash', async () => {
    const created = await createViaHandler();
    const listing = created.body as { listingId: string; contentHash: string };
    await publishListingHandler(
      {
        method: 'POST',
        path: `/v1/marketplace/listings/${listing.listingId}/publish`,
        params: { listingId: listing.listingId },
        body: undefined,
        query: {},
        headers: {},
      },
      ctx,
    );
    const res = await installThemeHandler(
      {
        method: 'POST',
        path: '/v1/marketplace/installs',
        params: {},
        body: {
          listingId: listing.listingId,
          installerOrgId: 'buyer-org',
          submittedContentHash: 'f'.repeat(64),
          adminOverride: false,
        },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(409);
    expect(metrics.snapshot().installRejectedTotal).toBe(1);
  });

  it('installs a verified bundle into a draft kit', async () => {
    const created = await createViaHandler();
    const listing = created.body as { listingId: string; contentHash: string };
    await publishListingHandler(
      {
        method: 'POST',
        path: `/v1/marketplace/listings/${listing.listingId}/publish`,
        params: { listingId: listing.listingId },
        body: undefined,
        query: {},
        headers: {},
      },
      ctx,
    );
    const res = await installThemeHandler(
      {
        method: 'POST',
        path: '/v1/marketplace/installs',
        params: {},
        body: {
          listingId: listing.listingId,
          installerOrgId: 'buyer-org',
          submittedContentHash: listing.contentHash,
          adminOverride: false,
        },
        query: {},
        headers: {},
      },
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { brandKitDraftId: string }).brandKitDraftId).toMatch(/^[0-9A-Z]{26}$/);
    expect(metrics.snapshot().installTotal).toBe(1);
  });
});
