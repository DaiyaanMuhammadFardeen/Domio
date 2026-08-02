import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import {
  createListing,
  allowedTransition,
  transitionListing,
  listListings,
  getPublicListing,
  LISTING_TRANSITIONS,
} from './listings.js';
import type { ComponentPackage, MarketplaceListing } from '../store/types.js';

async function seedPackage(store: InMemoryStore, catalogId: string): Promise<void> {
  const pkg: ComponentPackage = {
    id: `${catalogId}:1.0.0`, catalogId, version: '1.0.0', kind: 'component', name: catalogId, description: '',
    propsSchema: { type: 'object', properties: {} }, variants: [], files: {}, packageHash: '', sizeBudgetBytes: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await store.putPackage(pkg);
}

async function seedListing(store: InMemoryStore, overrides: Partial<MarketplaceListing> & { id: string }): Promise<MarketplaceListing> {
  const listing: MarketplaceListing = {
    catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '',
    status: 'draft', isFree: true, tags: [], createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  };
  await store.putListing(listing);
  return listing;
}

describe('listings', () => {
  let store: InMemoryStore;
  let deps: ReturnType<typeof defaultDeps>;

  beforeEach(() => {
    store = new InMemoryStore();
    deps = defaultDeps(store);
  });

  describe('LISTING_TRANSITIONS', () => {
    it('defines valid transitions for all statuses', () => {
      expect(LISTING_TRANSITIONS.draft).toContain('in_review');
      expect(LISTING_TRANSITIONS.in_review).toContain('published');
      expect(LISTING_TRANSITIONS.published).toContain('deprecated');
      expect(LISTING_TRANSITIONS.removed).toEqual([]);
    });
  });

  describe('allowedTransition', () => {
    it('returns true for valid transitions', () => {
      expect(allowedTransition('draft', 'in_review')).toBe(true);
      expect(allowedTransition('in_review', 'published')).toBe(true);
      expect(allowedTransition('published', 'deprecated')).toBe(true);
      expect(allowedTransition('deprecated', 'removed')).toBe(true);
    });
    it('returns false for invalid transitions', () => {
      expect(allowedTransition('draft', 'published')).toBe(false);
      expect(allowedTransition('removed', 'draft')).toBe(false);
      expect(allowedTransition('draft', 'deprecated')).toBe(false);
    });
  });

  describe('createListing', () => {
    it('creates a draft listing', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: 'desc',
        priceCents: 0, isFree: true,
      });
      expect(listing.status).toBe('draft');
      expect(listing.isFree).toBe(true);
    });
    it('throws when component not found', async () => {
      await expect(createListing(deps, {
        catalogId: 'missing', sellerId: 's-1', title: 'X', description: '', priceCents: 0,
      })).rejects.toThrow('not found');
    });
    it('throws conflict when active listing exists', async () => {
      await seedPackage(store, 'comp.btn');
      await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 100,
      });
      await expect(createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn2', description: '', priceCents: 200,
      })).rejects.toThrow();
    });
    it('allows create when existing listing is removed', async () => {
      await seedPackage(store, 'comp.btn');
      const old = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, old.id, 'in_review', 'u');
      await transitionListing(deps, old.id, 'removed', 'u');
      const newListing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-2', title: 'Btn2', description: '', priceCents: 0,
      });
      expect(newListing.id).not.toBe(old.id);
    });
    it('sets optional fields', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: 'desc',
        priceCents: 500, currency: 'usd', tags: ['ui'], preview: { img: 'x.png' },
      });
      expect(listing.priceCents).toBe(500);
      expect(listing.currency).toBe('usd');
      expect(listing.tags).toEqual(['ui']);
      expect(listing.preview).toEqual({ img: 'x.png' });
    });
  });

  describe('transitionListing', () => {
    it('transitions draft -> in_review -> published', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      const reviewed = await transitionListing(deps, listing.id, 'in_review', 'u');
      expect(reviewed.status).toBe('in_review');
      const published = await transitionListing(deps, listing.id, 'published', 'u');
      expect(published.status).toBe('published');
      expect(published.publishedAt).toBeDefined();
    });
    it('transitions to deprecated', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'u');
      await transitionListing(deps, listing.id, 'published', 'u');
      const deprecated = await transitionListing(deps, listing.id, 'deprecated', 'u');
      expect(deprecated.status).toBe('deprecated');
      expect(deprecated.deprecatedAt).toBeDefined();
    });
    it('throws for invalid transition', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await expect(transitionListing(deps, listing.id, 'published', 'u')).rejects.toThrow('Invalid');
    });
    it('throws for missing listing', async () => {
      await expect(transitionListing(deps, 'missing', 'published', 'u')).rejects.toThrow('not found');
    });
    it('publish requires latest package not deprecated', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'u');
      // Deprecate the package
      const pkg = await store.getPackage('comp.btn', '1.0.0');
      if (pkg) {
        pkg.deprecation = { reason: 'old', deprecatedAt: Date.now() };
        await store.putPackage(pkg);
      }
      await expect(transitionListing(deps, listing.id, 'published', 'u')).rejects.toThrow('deprecated');
    });
    it('records audit row', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'actor-1');
      const auditRows = await store.listAudit('human');
      const listingAudit = auditRows.find((r) => r.resourceId === listing.id && r.action === 'listing.in_review');
      expect(listingAudit).toBeDefined();
    });
    it('includes reason in deprecated transition', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'u');
      await transitionListing(deps, listing.id, 'published', 'u');
      const dep = await transitionListing(deps, listing.id, 'deprecated', 'u', 'no longer maintained');
      expect(dep.deprecatedAt).toBeDefined();
    });
    it('transition to removed from deprecated', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'u');
      await transitionListing(deps, listing.id, 'published', 'u');
      await transitionListing(deps, listing.id, 'deprecated', 'u');
      await transitionListing(deps, listing.id, 'removed', 'u');
      const r = await deps.store.getListing(listing.id);
      expect(r!.status).toBe('removed');
    });
    it('transition from in_review back to draft', async () => {
      await seedPackage(store, 'comp.btn');
      const listing = await createListing(deps, {
        catalogId: 'comp.btn', sellerId: 's-1', title: 'Btn', description: '', priceCents: 0,
      });
      await transitionListing(deps, listing.id, 'in_review', 'u');
      const draft = await transitionListing(deps, listing.id, 'draft', 'u');
      expect(draft.status).toBe('draft');
    });
  });

  describe('listListings', () => {
    it('returns non-removed listings by default', async () => {
      await seedPackage(store, 'comp.a');
      await seedPackage(store, 'comp.b');
      await createListing(deps, { catalogId: 'comp.a', sellerId: 's', title: 'A', description: '', priceCents: 0 });
      const l2 = await createListing(deps, { catalogId: 'comp.b', sellerId: 's', title: 'B', description: '', priceCents: 0 });
      await transitionListing(deps, l2.id, 'in_review', 'u');
      await transitionListing(deps, l2.id, 'removed', 'u');
      const all = await listListings(deps);
      expect(all.length).toBe(1);
    });
    it('filters by status', async () => {
      await seedPackage(store, 'comp.a');
      const l = await createListing(deps, { catalogId: 'comp.a', sellerId: 's', title: 'A', description: '', priceCents: 0 });
      await transitionListing(deps, l.id, 'in_review', 'u');
      await transitionListing(deps, l.id, 'published', 'u');
      const published = await listListings(deps, { status: 'published' });
      expect(published.length).toBe(1);
    });
    it('filters by sellerId', async () => {
      await seedPackage(store, 'comp.a');
      await createListing(deps, { catalogId: 'comp.a', sellerId: 's1', title: 'A', description: '', priceCents: 0 });
      const result = await listListings(deps, { sellerId: 's1' });
      expect(result.length).toBe(1);
    });
    it('respects limit', async () => {
      await seedPackage(store, 'comp.a');
      await createListing(deps, { catalogId: 'comp.a', sellerId: 's', title: 'A', description: '', priceCents: 0 });
      const result = await listListings(deps, { limit: 0 });
      expect(result.length).toBe(0);
    });
  });

  describe('getPublicListing', () => {
    it('returns a published listing', async () => {
      await seedListing(store, { id: 'l1', status: 'published' });
      const result = await getPublicListing(deps, 'l1');
      expect(result.id).toBe('l1');
    });
    it('throws for missing listing', async () => {
      await expect(getPublicListing(deps, 'missing')).rejects.toThrow('not found');
    });
    it('throws gone for removed listing', async () => {
      await seedListing(store, { id: 'l1', status: 'removed' });
      await expect(getPublicListing(deps, 'l1')).rejects.toThrow('removed');
    });
  });
});
