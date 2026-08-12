/**
 * marketplace-service — tests.
 *
 * Per Wave 1 §S1.2 acceptance: services ship with at least one test
 * that asserts the public shape.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCuratedListings } from './marketplace-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('marketplace-service', () => {
  it('returns the page on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        items: [
          {
            listing_id: 'L1',
            title: 'Hero Card',
            slug: 'hero-card',
            is_free: true,
            price_cents: 0,
            currency: 'USD',
            override_price_cents: null,
            brand_locked_state: 'allow',
          },
        ],
        total: 1,
      }),
    })) as unknown as typeof fetch;

    const page = await fetchCuratedListings('brand-acme', 40, 0, 'http://api.test');
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0]?.listing_id).toBe('L1');
  });

  it('throws on a non-2xx response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      fetchCuratedListings('brand-acme', 40, 0, 'http://api.test'),
    ).rejects.toThrow(/503/);
  });

  it('forwards brand_kit_id, limit, offset as query params', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ items: [], total: 0 }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchCuratedListings('brand-x', 10, 20, 'http://api.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('brand_kit_id=brand-x');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('offset=20');
    expect(calledUrl.startsWith('http://api.test/v1/marketplace/curated?')).toBe(true);
  });
});