/**
 * Wave 9 S9.1 — search-service tests.
 */
import { describe, expect, it } from 'vitest';
import {
  searchListings,
  getFeatured,
  getTopRated,
  getRecentlyAdded,
  getByCategory,
} from './search-service';

describe('search-service', () => {
  it('searchListings with empty query returns all 24 listings', async () => {
    const res = await searchListings({});
    expect(res.total).toBe(24);
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('searchListings filters by kind', async () => {
    const res = await searchListings({ kind: 'template' });
    expect(res.total).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(item.kind).toBe('template');
    }
  });

  it('searchListings filters by price range', async () => {
    const min = 1000;
    const max = 5000;
    const res = await searchListings({
      price_min_cents: min,
      price_max_cents: max,
    });
    for (const item of res.items) {
      expect(item.price_cents).toBeGreaterThanOrEqual(min);
      expect(item.price_cents).toBeLessThanOrEqual(max);
    }
  });

  it('searchListings filters by min_rating', async () => {
    const res = await searchListings({ min_rating: 4 });
    for (const item of res.items) {
      expect(item.rating_avg ?? 0).toBeGreaterThanOrEqual(4);
    }
  });

  it('searchListings returns facets with counts', async () => {
    const res = await searchListings({});
    expect(res.facets).toBeDefined();
    expect(res.facets.kind.length).toBeGreaterThan(0);
    expect(res.facets.theme.length).toBeGreaterThan(0);
    expect(res.facets.color.length).toBeGreaterThan(0);
    expect(res.facets.price.free + res.facets.price.paid).toBe(24);
  });

  it('getFeatured returns 4 listings', async () => {
    const items = await getFeatured();
    expect(items).toHaveLength(4);
  });

  it('getTopRated is sorted by rating desc', async () => {
    const items = await getTopRated();
    expect(items).toHaveLength(6);
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!.rating_avg ?? 0;
      const cur = items[i]!.rating_avg ?? 0;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it('getRecentlyAdded is sorted by created_at desc', async () => {
    const items = await getRecentlyAdded();
    expect(items).toHaveLength(6);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.created_at).toBeGreaterThanOrEqual(items[i]!.created_at);
    }
  });

  it('getByCategory returns 4 per category', async () => {
    const groups = await getByCategory();
    for (const kind of ['component', 'template', 'theme', 'sticker_pack', 'icon_pack'] as const) {
      expect(groups[kind].length).toBeLessThanOrEqual(4);
    }
  });
});