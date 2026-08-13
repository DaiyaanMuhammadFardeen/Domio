import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import type { MarketplaceListing } from '../store/types.js';
import { indexListing, reindexAll, searchListings, listCategories } from './search.js';

function makeListing(overrides: Partial<MarketplaceListing> & { id: string }): MarketplaceListing {
  return {
    catalogId: `cat-${overrides.id}`,
    sellerId: 'seller-1',
    title: `Component ${overrides.id}`,
    description: `A great component ${overrides.id}`,
    status: 'published',
    isFree: false,
    priceCents: 1000,
    currency: 'usd',
    tags: ['ui', 'button'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('search', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    const listings = [
      makeListing({
        id: 'a',
        title: 'Fancy Button',
        description: 'A clickable button',
        tags: ['ui', 'button'],
        priceCents: 1000,
      }),
      makeListing({
        id: 'b',
        title: 'Dark Navbar',
        description: 'A dark navigation bar',
        tags: ['ui', 'nav'],
        priceCents: 2000,
      }),
      makeListing({
        id: 'c',
        title: 'Hero Banner',
        description: 'A hero section banner',
        tags: ['layout', 'banner'],
        priceCents: 500,
        isFree: false,
      }),
      makeListing({
        id: 'd',
        title: 'Cheap Input',
        description: 'An input field',
        tags: ['ui', 'form'],
        priceCents: 100,
      }),
      makeListing({
        id: 'e',
        title: 'Removed Widget',
        description: 'This was removed',
        tags: ['ui'],
        status: 'removed',
        priceCents: 500,
      }),
    ];
    for (const l of listings) {
      await store.putListing(l);
    }
    await reindexAll(defaultDeps(store));
  });

  describe('reindexAll', () => {
    it('indexes all non-removed listings', async () => {
      const result = await searchListings(defaultDeps(store));
      // e is removed so should not appear
      expect(result.items.every((l) => l.status !== 'removed')).toBe(true);
    });
  });

  describe('indexListing', () => {
    it('indexes a single listing', async () => {
      const newListing = makeListing({
        id: 'new',
        title: 'New Component',
        description: 'Brand new',
        tags: ['new'],
      });
      await store.putListing(newListing);
      await indexListing(defaultDeps(store), 'new');
      const result = await searchListings(defaultDeps(store), { q: 'Brand new' });
      expect(result.items.some((l) => l.id === 'new')).toBe(true);
    });
  });

  describe('text search', () => {
    it('finds by title', async () => {
      const result = await searchListings(defaultDeps(store), { q: 'Button' });
      expect(result.items.some((l) => l.id === 'a')).toBe(true);
      expect(result.items.every((l) => l.id !== 'e')).toBe(true);
    });

    it('finds by description', async () => {
      const result = await searchListings(defaultDeps(store), { q: 'navigation' });
      expect(result.items.some((l) => l.id === 'b')).toBe(true);
    });

    it('finds by tag', async () => {
      const result = await searchListings(defaultDeps(store), { q: 'banner' });
      expect(result.items.some((l) => l.id === 'c')).toBe(true);
    });

    it('returns empty for non-matching query', async () => {
      const result = await searchListings(defaultDeps(store), { q: 'zzznotfound' });
      expect(result.items).toHaveLength(0);
    });
  });

  describe('price filter', () => {
    it('filters by minPrice', async () => {
      const result = await searchListings(defaultDeps(store), { minPrice: 500 });
      expect(result.items.every((l) => (l.priceCents ?? 0) >= 500 || l.isFree)).toBe(true);
      // d (100) should be excluded
      expect(result.items.some((l) => l.id === 'd')).toBe(false);
    });

    it('filters by maxPrice', async () => {
      const result = await searchListings(defaultDeps(store), { maxPrice: 1000 });
      expect(result.items.every((l) => (l.priceCents ?? 0) <= 1000)).toBe(true);
      // b (2000) should be excluded
      expect(result.items.some((l) => l.id === 'b')).toBe(false);
    });
  });

  describe('category filter', () => {
    it('filters by tag category', async () => {
      const result = await searchListings(defaultDeps(store), { category: 'nav' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('b');
    });
  });

  describe('sort', () => {
    it('sorts by newest', async () => {
      const result = await searchListings(defaultDeps(store), { sort: 'newest' });
      const ids = result.items.map((l) => l.id);
      // All have same createdAt so order is stable, but verify it doesn't crash
      expect(ids.length).toBeGreaterThan(0);
    });

    it('sorts by price-asc', async () => {
      const result = await searchListings(defaultDeps(store), { sort: 'price-asc' });
      const prices = result.items.map((l) => l.priceCents ?? 0);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]!).toBeGreaterThanOrEqual(prices[i - 1]!);
      }
    });

    it('sorts by price-desc', async () => {
      const result = await searchListings(defaultDeps(store), { sort: 'price-desc' });
      const prices = result.items.map((l) => l.priceCents ?? 0);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]!).toBeLessThanOrEqual(prices[i - 1]!);
      }
    });
  });

  describe('pagination', () => {
    it('returns correct page size and total', async () => {
      const result = await searchListings(defaultDeps(store), { page: 1, pageSize: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.pageSize).toBe(2);
      expect(result.page).toBe(1);
      expect(result.total).toBeGreaterThan(2);
    });

    it('returns second page', async () => {
      const page1 = await searchListings(defaultDeps(store), { page: 1, pageSize: 2 });
      const page2 = await searchListings(defaultDeps(store), { page: 2, pageSize: 2 });
      // No overlap
      const ids1 = page1.items.map((l) => l.id);
      const ids2 = page2.items.map((l) => l.id);
      expect(ids1.every((id) => !ids2.includes(id))).toBe(true);
    });
  });

  describe('removed-listings exclusion', () => {
    it('never returns removed listings', async () => {
      const result = await searchListings(defaultDeps(store));
      expect(result.items.some((l) => l.status === 'removed')).toBe(false);
    });
  });

  describe('listCategories', () => {
    it('returns distinct tags from non-removed listings', async () => {
      const cats = await listCategories(defaultDeps(store));
      expect(cats).toContain('ui');
      expect(cats).toContain('button');
      expect(cats).toContain('nav');
      expect(cats).toContain('layout');
      expect(cats).toContain('banner');
      expect(cats).toContain('form');
      expect(cats).not.toContain('removed');
      // Sorted
      expect(cats).toEqual([...cats].sort());
    });
  });
});
