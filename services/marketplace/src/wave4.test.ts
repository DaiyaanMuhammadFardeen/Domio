/**
 * Wave 4 service integration tests (Phase 19 Wave 4 — WS-MKT-5/8/9).
 *
 * Service integration with mem_store + handlers for curated, takedown, trust.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from './service.js';
import { InMemoryMarketplaceStore } from './store/mem_store.js';
import { BrandLockDeniedError, InvalidBrandLockError, BrandLockNotFoundError } from './curated/types.js';
import { InvalidTakedownTransitionError } from './takedown/types.js';
import { handlers } from './handlers.js';
import type { HttpRequest, MarketplaceHandlerContext } from './handlers.js';

describe('Wave 4 — Curated / Brand-Lock', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
  });

  describe('createBrandLock', () => {
    it('creates a brand lock', async () => {
      const lock = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      expect(lock.id).toBeTruthy();
      expect(lock.state).toBe('allow');
      expect(lock.workspaceId).toBe('ws-1');
    });

    it('throws for duplicate lock', async () => {
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      await expect(
        service.createBrandLock({
          workspaceId: 'ws-1',
          brandKitId: 'brand-1',
          marketplaceListingId: 'listing-1',
          state: 'deny',
        }),
      ).rejects.toThrow(InvalidBrandLockError);
    });

    it('validates state', async () => {
      await expect(
        service.createBrandLock({
          workspaceId: 'ws-1',
          brandKitId: 'brand-1',
          marketplaceListingId: 'listing-1',
          state: 'invalid' as never,
        }),
      ).rejects.toThrow(InvalidBrandLockError);
    });
  });

  describe('getBrandLock', () => {
    it('returns existing lock', async () => {
      const created = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      const found = await service.getBrandLock('ws-1', 'brand-1', 'listing-1');
      expect(found.id).toBe(created.id);
    });

    it('throws for non-existent lock', async () => {
      await expect(
        service.getBrandLock('ws-1', 'brand-1', 'listing-1'),
      ).rejects.toThrow(BrandLockNotFoundError);
    });
  });

  describe('listBrandLocks', () => {
    it('returns locks for a brand', async () => {
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-2',
        state: 'deny',
      });
      const locks = await service.listBrandLocks('ws-1', 'brand-1');
      expect(locks).toHaveLength(2);
    });
  });

  describe('updateBrandLock', () => {
    it('updates state', async () => {
      const created = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      const updated = await service.updateBrandLock(created.id, { state: 'deny' });
      expect(updated.state).toBe('deny');
    });

    it('validates state', async () => {
      const created = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      await expect(
        service.updateBrandLock(created.id, { state: 'invalid' as never }),
      ).rejects.toThrow(InvalidBrandLockError);
    });
  });

  describe('deleteBrandLock', () => {
    it('deletes a lock', async () => {
      const created = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      await service.deleteBrandLock(created.id);
      await expect(
        service.getBrandLock('ws-1', 'brand-1', 'listing-1'),
      ).rejects.toThrow(BrandLockNotFoundError);
    });
  });

  describe('assertBrandLockAllowed', () => {
    it('does nothing for allow lock', async () => {
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      await expect(
        service.assertBrandLockAllowed('ws-1', 'brand-1', 'listing-1'),
      ).resolves.not.toThrow();
    });

    it('throws BrandLockDeniedError for deny lock', async () => {
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'deny',
      });
      await expect(
        service.assertBrandLockAllowed('ws-1', 'brand-1', 'listing-1'),
      ).rejects.toThrow(BrandLockDeniedError);
    });
  });
});

describe('Wave 4 — Takedowns', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;

  beforeEach(async () => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });

    // Create a listing for takedown tests
    await service.createListing({
      catalogId: 'comp-1',
      sellerId: 'seller-1',
      title: 'Test Component',
    });
  });

  describe('fileTakedown', () => {
    it('files a takedown request', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'This infringes my copyright.',
      });
      expect(request.id).toBeTruthy();
      expect(request.status).toBe('received');
      expect(request.kind).toBe('dmca');
    });

    it('throws for invalid kind', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      await expect(
        service.fileTakedown({
          workspaceId: 'ws-1',
          listingId: listing.id,
          claimantId: 'user-1',
          kind: 'invalid' as never,
          statement: 'Test',
        }),
      ).rejects.toThrow('Invalid takedown kind');
    });
  });

  describe('reviewTakedown', () => {
    it('transitions received → in_review', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      const reviewed = await service.reviewTakedown(request.id);
      expect(reviewed.status).toBe('in_review');
    });

    it('throws for invalid transition', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      // received → confirmed is invalid
      await expect(
        service.confirmTakedown(request.id),
      ).rejects.toThrow(InvalidTakedownTransitionError);
    });
  });

  describe('confirmTakedown', () => {
    it('transitions in_review → confirmed and removes listing', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      const confirmed = await service.confirmTakedown(request.id, 'Valid claim');
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.resolutionNotes).toBe('Valid claim');

      // Verify listing is removed
      const updatedListing = await service.getListing(listing.id);
      expect(updatedListing.status).toBe('removed');
    });
  });

  describe('dismissTakedown', () => {
    it('transitions in_review → resolved', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      const dismissed = await service.dismissTakedown(request.id, 'Not valid');
      expect(dismissed.status).toBe('resolved');
      expect(dismissed.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('counterNoticeTakedown', () => {
    it('transitions confirmed → counter_notice', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      await service.confirmTakedown(request.id);
      const counterNotice = await service.counterNoticeTakedown(request.id);
      expect(counterNotice.status).toBe('counter_notice');
    });
  });

  describe('resolveTakedown', () => {
    it('transitions confirmed → resolved', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      await service.confirmTakedown(request.id);
      const resolved = await service.resolveTakedown(request.id, 'Resolved');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
    });
  });
});

describe('Wave 4 — Trust Scoring', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;

  beforeEach(async () => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });

    // Create a listing for trust tests
    await service.createListing({
      catalogId: 'comp-1',
      sellerId: 'seller-1',
      title: 'Test Component',
    });
  });

  describe('computeAndStoreTrustScore', () => {
    it('computes and stores trust score', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const score = await service.computeAndStoreTrustScore(listing.id, {
        malware_scan: 1,
        pricing_anomaly: 0,
      });
      expect(score.id).toBeTruthy();
      expect(score.listingId).toBe(listing.id);
      expect(score.score).toBeGreaterThan(0);
      expect(score.signals).toEqual({ malware_scan: 1, pricing_anomaly: 0 });
    });

    it('throws for non-existent listing', async () => {
      await expect(
        service.computeAndStoreTrustScore('nonexistent', {}),
      ).rejects.toThrow('Listing not found');
    });
  });

  describe('getTrustScore', () => {
    it('returns null when no score exists', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      const score = await service.getTrustScore(listing.id);
      expect(score).toBeNull();
    });

    it('returns stored score', async () => {
      const listing = await service.getListing(
        (await store.listListings())[0]!.id,
      );
      await service.computeAndStoreTrustScore(listing.id, { malware_scan: 1 });
      const score = await service.getTrustScore(listing.id);
      expect(score).not.toBeNull();
      expect(score!.score).toBe(1);
    });
  });
});

describe('Wave 4 — Handler integration', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;
  let ctx: MarketplaceHandlerContext;

  beforeEach(async () => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
    ctx = { service };

    // Create a listing for handler tests
    await service.createListing({
      catalogId: 'comp-1',
      sellerId: 'seller-1',
      title: 'Test Component',
    });
  });

  function makeReq<P = Record<string, never>, B = Record<string, never>, Q = Record<string, string | undefined>>(
    params: P, body: B, query: Q = {} as Q, headers: Record<string, string | undefined> = {},
  ): HttpRequest<P, B, Q> {
    return { method: 'GET', path: '/', params, body, query, headers };
  }

  describe('createBrandLock', () => {
    it('returns 201 with lock', async () => {
      const res = await handlers.createBrandLock(
        makeReq({}, {
          workspace_id: 'ws-1',
          brand_kit_id: 'brand-1',
          marketplace_listing_id: 'listing-1',
          state: 'allow',
        }),
        ctx,
      );
      expect(res.status).toBe(201);
      expect((res.body as { lock: { id: string } }).lock.id).toBeTruthy();
    });
  });

  describe('listBrandLocks', () => {
    it('returns 200 with locks', async () => {
      await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      const res = await handlers.listBrandLocks(
        makeReq({}, undefined as never, { workspace_id: 'ws-1', brand_kit_id: 'brand-1' }) as never,
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { locks: unknown[] }).locks).toHaveLength(1);
    });
  });

  describe('fileTakedown', () => {
    it('returns 201 with request', async () => {
      const listing = (await store.listListings())[0]!;
      const res = await handlers.fileTakedown(
        makeReq({}, {
          workspace_id: 'ws-1',
          listing_id: listing.id,
          claimant_id: 'user-1',
          kind: 'dmca',
          statement: 'Copyright infringement',
        }),
        ctx,
      );
      expect(res.status).toBe(201);
      expect((res.body as { request: { id: string } }).request.id).toBeTruthy();
    });
  });

  describe('reviewTakedown', () => {
    it('returns 200', async () => {
      const listing = (await store.listListings())[0]!;
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      const res = await handlers.reviewTakedown(
        makeReq({ request_id: request.id }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('computeTrustScore', () => {
    it('returns 200 with score', async () => {
      const listing = (await store.listListings())[0]!;
      const res = await handlers.computeTrustScore(
        makeReq({}, { listing_id: listing.id, signals: { malware_scan: 1 } }),
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { score: { score: number } }).score.score).toBe(1);
    });
  });

  describe('getTrustScore', () => {
    it('returns 200 with null when no score', async () => {
      const listing = (await store.listListings())[0]!;
      const res = await handlers.getTrustScore(
        makeReq({ listing_id: listing.id }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { score: unknown }).score).toBeNull();
    });
  });

  describe('listTakedownRequests', () => {
    it('returns 200 with requests', async () => {
      const listing = (await store.listListings())[0]!;
      await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      const res = await handlers.listTakedownRequests(
        makeReq({}, undefined as never, {}) as never,
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { requests: unknown[] }).requests).toHaveLength(1);
    });

    it('returns 200 with filtered requests', async () => {
      const listing = (await store.listListings())[0]!;
      await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      const res = await handlers.listTakedownRequests(
        makeReq({}, undefined as never, { status: 'received', kind: 'dmca' }) as never,
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { requests: unknown[] }).requests).toHaveLength(1);
    });
  });

  describe('resolveTakedownRequest', () => {
    it('returns 200 with confirmed decision', async () => {
      const listing = (await store.listListings())[0]!;
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      const res = await handlers.resolveTakedownRequest(
        makeReq({ request_id: request.id }, { decision: 'confirmed', resolution_notes: 'Valid' }),
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { request: { status: string } }).request.status).toBe('confirmed');
    });

    it('returns 200 with dismissed decision', async () => {
      const listing = (await store.listListings())[0]!;
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      const res = await handlers.resolveTakedownRequest(
        makeReq({ request_id: request.id }, { decision: 'dismissed', resolution_notes: 'Not valid' }),
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { request: { status: string } }).request.status).toBe('resolved');
    });
  });

  describe('submitCounterNotice', () => {
    it('returns 200', async () => {
      const listing = (await store.listListings())[0]!;
      const request = await service.fileTakedown({
        workspaceId: 'ws-1',
        listingId: listing.id,
        claimantId: 'user-1',
        kind: 'dmca',
        statement: 'Test',
      });
      await service.reviewTakedown(request.id);
      await service.confirmTakedown(request.id);
      const res = await handlers.submitCounterNotice(
        makeReq({ request_id: request.id }, { statement: 'Counter notice' }),
        ctx,
      );
      expect(res.status).toBe(200);
      expect((res.body as { request: { status: string } }).request.status).toBe('counter_notice');
    });
  });

  describe('deleteBrandLock', () => {
    it('returns 204 with no body', async () => {
      const lock = await service.createBrandLock({
        workspaceId: 'ws-1',
        brandKitId: 'brand-1',
        marketplaceListingId: 'listing-1',
        state: 'allow',
      });
      const res = await handlers.deleteBrandLock(
        makeReq({ brand_lock_id: lock.id }, {}),
        ctx,
      );
      expect(res.status).toBe(204);
      expect(res.body).toBeUndefined();
    });
  });
});
