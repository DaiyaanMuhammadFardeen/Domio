/**
 * Marketplace preview service tests.
 */

import { describe, it, expect } from 'vitest';
import { asULID } from '@domio/schema';
import { InMemoryMarketplaceRepository, type ThemeBundle } from './dal.js';
import {
  MarketplacePreviewService,
  ContentHashMismatchError,
  RestrictedLicenseError,
  A11yCertificationRequiredError,
  ListingValidationError,
  hashThemeBundle,
} from './service.js';

const ORG = 'org-1';
const ACTOR = 'user-1';
let idCounter = 0;
function idGen() {
  idCounter++;
  return asULID(`01H0000000000000000${idCounter.toString().padStart(7, '0')}`);
}

const BASE_BUNDLE: ThemeBundle = {
  schemaVersion: '1.0.0',
  brandKitDraft: { name: 'Acme Brand Kit', palette: ['#33180c', '#aa3a14'] },
  themes: [{ name: 'Acme Light', tokens: { 'color.bg': '#ffffff' } }],
  assets: [
    {
      assetId: 'font-1',
      kind: 'font',
      name: 'Acme Sans',
      licenseStatus: 'permissive',
      licenseUrl: 'https://scripts.sil.org/OFL',
      contentHash: 'a'.repeat(64),
    },
  ],
};

function makeService() {
  idCounter = 0;
  const repo = new InMemoryMarketplaceRepository();
  const service = new MarketplacePreviewService({
    repository: repo,
    idGenerator: idGen,
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  return { service, repo };
}

async function createAndPublish(service: MarketplacePreviewService, bundle = BASE_BUNDLE) {
  const listing = await service.createListing({
    sellerOrgId: ORG,
    name: 'Acme Theme',
    description: 'A warm coffee-shop theme.',
    bundle,
    createdBy: ACTOR,
  });
  return service.publishListing(listing.listingId);
}

describe('MarketplacePreviewService', () => {
  it('creates a draft listing with deterministic SHA-256 content hash', async () => {
    const { service } = makeService();
    const listing = await service.createListing({
      sellerOrgId: ORG,
      name: 'Acme Theme',
      description: 'Description',
      bundle: BASE_BUNDLE,
      createdBy: ACTOR,
    });
    expect(listing.status).toBe('draft');
    expect(listing.contentHash).toBe(hashThemeBundle(BASE_BUNDLE));
    expect(listing.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a bundle without themes', async () => {
    const { service } = makeService();
    const bad: ThemeBundle = { ...BASE_BUNDLE, themes: [] };
    await expect(
      service.createListing({
        sellerOrgId: ORG,
        name: 'Bad Theme',
        description: '',
        bundle: bad,
        createdBy: ACTOR,
      }),
    ).rejects.toBeInstanceOf(ListingValidationError);
  });

  it('publishes and lists published listings', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    const published = await service.listListings('published');
    expect(listing.status).toBe('published');
    expect(published.map((x) => x.listingId)).toContain(listing.listingId);
  });

  it('updates a bundle and invalidates a11y certification', async () => {
    const { service } = makeService();
    const listing = await service.createListing({
      sellerOrgId: ORG,
      name: 'Acme Theme',
      description: '',
      bundle: BASE_BUNDLE,
      createdBy: ACTOR,
    });
    await service.certifyA11y(listing.listingId, true);
    const updated = await service.updateListing(listing.listingId, {
      bundle: {
        ...BASE_BUNDLE,
        themes: [{ name: 'Acme Light v2', tokens: { 'color.bg': '#fefefe' } }],
      },
    });
    expect(updated.a11yCertified).toBe(false);
    expect(updated.featured).toBe(false);
  });

  it('requires a11y certification before featuring a listing', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    await expect(service.setFeatured(listing.listingId, true)).rejects.toBeInstanceOf(
      A11yCertificationRequiredError,
    );
  });

  it('allows featuring after a11y certification', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    await service.certifyA11y(listing.listingId, true);
    const featured = await service.setFeatured(listing.listingId, true);
    expect(featured.featured).toBe(true);
  });

  it('installs a published bundle into a new brand-kit draft', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    const install = await service.installTheme({
      listingId: listing.listingId,
      installerOrgId: 'buyer-org',
      submittedContentHash: listing.contentHash,
      installedBy: 'buyer-1',
      isAdmin: false,
    });
    expect(install.brandKitDraftId).toMatch(/^[0-9A-Z]{26}$/);
    expect(install.verifiedContentHash).toBe(listing.contentHash);
    expect(install.adminOverride).toBe(false);
  });

  it('rejects tampered bundle installs', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    await expect(
      service.installTheme({
        listingId: listing.listingId,
        installerOrgId: 'buyer-org',
        submittedContentHash: 'f'.repeat(64),
        installedBy: 'buyer-1',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(ContentHashMismatchError);
  });

  it('rejects restricted assets without admin override', async () => {
    const restricted: ThemeBundle = {
      ...BASE_BUNDLE,
      assets: BASE_BUNDLE.assets.map((a) => ({ ...a, licenseStatus: 'restricted' as const })),
    };
    const { service } = makeService();
    const listing = await createAndPublish(service, restricted);
    await expect(
      service.installTheme({
        listingId: listing.listingId,
        installerOrgId: 'buyer-org',
        submittedContentHash: listing.contentHash,
        installedBy: 'buyer-1',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(RestrictedLicenseError);
  });

  it('allows admin override for restricted assets', async () => {
    const restricted: ThemeBundle = {
      ...BASE_BUNDLE,
      assets: BASE_BUNDLE.assets.map((a) => ({ ...a, licenseStatus: 'restricted' as const })),
    };
    const { service } = makeService();
    const listing = await createAndPublish(service, restricted);
    const install = await service.installTheme({
      listingId: listing.listingId,
      installerOrgId: 'buyer-org',
      submittedContentHash: listing.contentHash,
      installedBy: 'admin-1',
      isAdmin: true,
      adminOverride: true,
    });
    expect(install.adminOverride).toBe(true);
  });

  it('requires opt-in for buyer-applied sample thumbnails', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    await expect(
      service.addReview({
        listingId: listing.listingId,
        orgId: 'buyer-org',
        rating: 5,
        body: 'Great theme',
        sampleThumbnailUrl: 'https://cdn.example.com/sample.png',
        sampleOptIn: false,
        createdBy: 'buyer-1',
      }),
    ).rejects.toBeInstanceOf(ListingValidationError);
  });

  it('stores opt-in reviews and sample thumbnails', async () => {
    const { service } = makeService();
    const listing = await createAndPublish(service);
    const review = await service.addReview({
      listingId: listing.listingId,
      orgId: 'buyer-org',
      rating: 5,
      body: 'Great theme',
      sampleThumbnailUrl: 'https://cdn.example.com/sample.png',
      sampleOptIn: true,
      createdBy: 'buyer-1',
    });
    const reviews = await service.listReviews(listing.listingId);
    expect(reviews).toHaveLength(1);
    expect(review.sampleOptIn).toBe(true);
    expect(review.sampleThumbnailUrl).toContain('sample.png');
  });
});
