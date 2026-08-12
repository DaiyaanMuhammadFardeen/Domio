/**
 * Stock — Wave 2 §S2.4 unit tests.
 *
 * The local fallback catalog is exercised directly. The async search
 * API is shaped so the future Unsplash/Pexels client can drop in
 * without breaking consumers.
 */

import { describe, expect, it } from 'vitest';
import { STOCK_PHOTOS, searchStock } from './stock';

describe('stock', () => {
  it('ships a curated starter catalog', () => {
    expect(STOCK_PHOTOS.length).toBeGreaterThan(0);
  });

  it('searchStock returns the fallback catalog', async () => {
    const res = await searchStock();
    expect(res.fallback).toBe(true);
    expect(res.total).toBe(STOCK_PHOTOS.length);
    expect(res.photos.length).toBeGreaterThan(0);
  });

  it('searchStock filters by query', async () => {
    const res = await searchStock({ query: 'office' });
    expect(res.photos.length).toBeGreaterThan(0);
    for (const p of res.photos) {
      const match =
        p.title.toLowerCase().includes('office') ||
        p.tags.some((t) => t.toLowerCase().includes('office'));
      expect(match).toBe(true);
    }
  });

  it('searchStock honours pagination', async () => {
    const res = await searchStock({ page: 1, pageSize: 1 });
    expect(res.photos.length).toBeLessThanOrEqual(1);
  });
});