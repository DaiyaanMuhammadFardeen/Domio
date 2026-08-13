import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import {
  issueLicenseGrant,
  verifyLicense,
  enforceSeats,
  revokeLicense,
  isPaidListing,
} from './license.js';
import type { MarketplaceListing } from '../store/types.js';

function makeListing(overrides: Partial<MarketplaceListing> & { id: string }): MarketplaceListing {
  return {
    catalogId: 'comp.btn',
    sellerId: 'seller-1',
    title: 'Button',
    description: 'A button',
    status: 'published',
    isFree: false,
    priceCents: 500,
    currency: 'usd',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('license', () => {
  let store: InMemoryStore;
  let deps: ReturnType<typeof defaultDeps>;

  beforeEach(() => {
    store = new InMemoryStore();
    deps = defaultDeps(store);
  });

  describe('isPaidListing', () => {
    it('returns true for paid published listing', () => {
      expect(isPaidListing(makeListing({ id: 'l1' }))).toBe(true);
    });
    it('returns false for free listing', () => {
      expect(isPaidListing(makeListing({ id: 'l1', isFree: true }))).toBe(false);
    });
    it('returns false for draft listing', () => {
      expect(isPaidListing(makeListing({ id: 'l1', status: 'draft' }))).toBe(false);
    });
    it('returns false when priceCents is zero', () => {
      expect(isPaidListing(makeListing({ id: 'l1', priceCents: 0, isFree: false }))).toBe(false);
    });
  });

  describe('issueLicenseGrant', () => {
    it('creates a signed license grant', async () => {
      const listing = makeListing({ id: 'l1' });
      await store.putListing(listing);

      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 5,
      });

      expect(grant.id).toBeTruthy();
      expect(grant.signedToken).toBeTruthy();
      expect(grant.seats).toBe(5);
      expect(grant.catalogId).toBe('comp.btn');
    });

    it('includes userId when provided', async () => {
      await store.putListing(makeListing({ id: 'l1' }));

      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        userId: 'user-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
      });
      expect(grant.userId).toBe('user-1');
    });

    it('throws when listing not found', async () => {
      await expect(
        issueLicenseGrant(deps, {
          workspaceId: 'ws-1',
          catalogId: 'comp.btn',
          version: '1.0.0',
          listingId: 'missing',
          seats: 1,
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('verifyLicense', () => {
    it('validates a good token', async () => {
      const listing = makeListing({ id: 'l1' });
      await store.putListing(listing);

      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
      });

      const result = await verifyLicense(deps, {
        token: grant.signedToken,
        catalogId: 'comp.btn',
        version: '1.0.0',
      });
      expect(result.valid).toBe(true);
      expect(result.grant).toBeDefined();
    });

    it('rejects invalid token', async () => {
      const result = await verifyLicense(deps, { token: 'bad-token' });
      expect(result.valid).toBe(false);
    });

    it('rejects when catalogId mismatches', async () => {
      await store.putListing(makeListing({ id: 'l1' }));
      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
      });
      const result = await verifyLicense(deps, {
        token: grant.signedToken,
        catalogId: 'comp.other',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('catalog-mismatch');
    });

    it('rejects when version mismatches', async () => {
      await store.putListing(makeListing({ id: 'l1' }));
      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
      });
      const result = await verifyLicense(deps, { token: grant.signedToken, version: '2.0.0' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('version-mismatch');
    });

    it('rejects when grant not in store', async () => {
      const { signJws } = await import('../crypto/index.js');
      const token = signJws(
        {
          sub: 'fake-id',
          catalog_id: 'c',
          version: '1',
          iat: 1,
          exp: 9999999999,
          offline_grace_until: 9999999999,
        },
        deps.licenseSecret,
      );
      const result = await verifyLicense(deps, { token });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unknown-license');
    });

    it('rejects revoked license', async () => {
      await store.putListing(makeListing({ id: 'l1' }));
      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
      });
      await revokeLicense(deps, grant.id);
      const result = await verifyLicense(deps, { token: grant.signedToken });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('revoked');
    });

    it('rejects when offline grace expired', async () => {
      await store.putListing(makeListing({ id: 'l1' }));
      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 1,
        now: 1000,
      });
      const farFuture = grant.offlineGraceUntil! + 1000;
      const result = await verifyLicense(deps, { token: grant.signedToken, now: farFuture });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('offline-expired');
    });
  });

  describe('enforceSeats', () => {
    it('does not throw when under seat cap', async () => {
      await store.putListing(makeListing({ id: 'l1' }));
      const grant = await issueLicenseGrant(deps, {
        workspaceId: 'ws-1',
        catalogId: 'comp.btn',
        version: '1.0.0',
        listingId: 'l1',
        seats: 5,
      });
      await expect(enforceSeats(deps, 'ws-1', 'comp.btn', grant)).resolves.toBeUndefined();
    });
  });

  describe('revokeLicense', () => {
    it('throws when license not found', async () => {
      await expect(revokeLicense(deps, 'missing')).rejects.toThrow('not found');
    });
  });
});
