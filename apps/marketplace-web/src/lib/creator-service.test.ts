/**
 * Wave 9 S9.9 — creator-service tests.
 *
 * Verifies the public functions return sensible data, fall back to seed
 * when the API is unreachable, and treat unknown creators as null.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCreator,
  listFeaturedCreators,
  getCreatorListings,
  getCreatorReviews,
} from './creator-service';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Force every fetch in this file to fail so we exercise the
  // deterministic fallback path that ships with the service.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('creator-service: network unavailable');
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('creator-service', () => {
  it('listFeaturedCreators returns 4-6 featured creators', async () => {
    const creators = await listFeaturedCreators();
    expect(creators.length).toBeGreaterThanOrEqual(4);
    expect(creators.length).toBeLessThanOrEqual(6);
  });

  it('listFeaturedCreators includes known handles', async () => {
    const creators = await listFeaturedCreators();
    const handles = new Set(creators.map((c) => c.handle));
    for (const expected of ['ada', 'turing', 'lovelace', 'hopper', 'katherine']) {
      expect(handles.has(expected)).toBe(true);
    }
  });

  it('getCreator returns profile for a known handle', async () => {
    const profile = await getCreator('ada');
    expect(profile).not.toBeNull();
    expect(profile!.handle).toBe('ada');
    expect(profile!.display_name).toBeTruthy();
    expect(profile!.listing_count).toBeGreaterThan(0);
  });

  it('getCreator returns null for an unknown handle', async () => {
    const profile = await getCreator('zzz-not-a-real-creator');
    expect(profile).toBeNull();
  });

  it('getCreatorListings returns cards for a known creator', async () => {
    const listings = await getCreatorListings('turing');
    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0]!.creator_name).toBe('Alan Turing');
    for (const l of listings) {
      expect(typeof l.title).toBe('string');
      expect(typeof l.slug).toBe('string');
    }
  });

  it('getCreatorListings returns [] for unknown creator', async () => {
    const listings = await getCreatorListings('mystery-person');
    expect(listings).toEqual([]);
  });

  it('getCreatorReviews returns accepted reviews', async () => {
    const reviews = await getCreatorReviews('lovelace');
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) {
      expect(r.status).toBe('accepted');
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });

  it('getCreatorReviews returns [] for unknown creator', async () => {
    const reviews = await getCreatorReviews('who-dis');
    expect(reviews).toEqual([]);
  });
});
