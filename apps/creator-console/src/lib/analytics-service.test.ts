/**
 * Tests for the Wave 9 §S9.3 analytics primitives.
 */

import { describe, expect, it } from 'vitest';
import {
  getConversionFunnel,
  getGeoDistribution,
  getRevenueSeries,
  getTopListings,
} from './analytics-service';
import type { AnalyticsPeriod } from './types';

describe('analytics-service / getRevenueSeries', () => {
  it('returns 30 points for the 30d period', async () => {
    const points = await getRevenueSeries('creator-1', '30d', 'day');
    expect(points.length).toBe(30);
  });

  it('returns non-negative revenue and refunds', async () => {
    const points = await getRevenueSeries('creator-1', '30d', 'day');
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.revenue_cents).toBeGreaterThanOrEqual(0);
      expect(p.refunds_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns 7 points for the 7d period', async () => {
    const points = await getRevenueSeries('creator-1', '7d', 'day');
    expect(points.length).toBe(7);
  });

  it('buckets the 90d period into weeks', async () => {
    const points = await getRevenueSeries('creator-1', '90d', 'week');
    expect(points.length).toBeGreaterThan(10);
    expect(points.length).toBeLessThan(20);
  });
});

describe('analytics-service / getTopListings', () => {
  it('returns 6 listings with non-zero revenue', async () => {
    const period: AnalyticsPeriod = '30d';
    const listings = await getTopListings('creator-1', period);
    expect(listings.length).toBe(6);
    for (const l of listings) {
      expect(l.revenue_cents).toBeGreaterThan(0);
      expect(l.units_sold).toBeGreaterThan(0);
      expect(l.conversion_rate).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts the listings by revenue descending', async () => {
    const listings = await getTopListings('creator-1', '30d');
    for (let i = 1; i < listings.length; i++) {
      expect(listings[i - 1]!.revenue_cents).toBeGreaterThanOrEqual(listings[i]!.revenue_cents);
    }
  });

  it('produces a fresh ordering when the period changes', async () => {
    const a = await getTopListings('creator-1', '30d');
    const b = await getTopListings('creator-1', '90d');
    expect(a.map((l) => l.listing_id)).not.toEqual(b.map((l) => l.listing_id));
  });
});

describe('analytics-service / getGeoDistribution', () => {
  it('returns 8 countries', async () => {
    const geos = await getGeoDistribution('creator-1', '30d');
    expect(geos.length).toBe(8);
  });

  it('every country has a unique ISO code', async () => {
    const geos = await getGeoDistribution('creator-1', '30d');
    const codes = new Set(geos.map((g) => g.country_code));
    expect(codes.size).toBe(geos.length);
  });

  it('every country has positive installs and revenue', async () => {
    const geos = await getGeoDistribution('creator-1', '30d');
    for (const g of geos) {
      expect(g.installs).toBeGreaterThan(0);
      expect(g.revenue_cents).toBeGreaterThan(0);
    }
  });

  it('sorts countries by revenue descending', async () => {
    const geos = await getGeoDistribution('creator-1', '30d');
    for (let i = 1; i < geos.length; i++) {
      expect(geos[i - 1]!.revenue_cents).toBeGreaterThanOrEqual(geos[i]!.revenue_cents);
    }
  });
});

describe('analytics-service / getConversionFunnel', () => {
  it('overall_conversion_rate is within [0, 1]', async () => {
    const funnel = await getConversionFunnel('creator-1', '30d');
    expect(funnel.overall_conversion_rate).toBeGreaterThanOrEqual(0);
    expect(funnel.overall_conversion_rate).toBeLessThanOrEqual(1);
  });

  it('all per-stage rates are in [0, 1]', async () => {
    const funnel = await getConversionFunnel('creator-1', '30d');
    expect(funnel.view_to_trial_rate).toBeGreaterThanOrEqual(0);
    expect(funnel.view_to_trial_rate).toBeLessThanOrEqual(1);
    expect(funnel.trial_to_purchase_rate).toBeGreaterThanOrEqual(0);
    expect(funnel.trial_to_purchase_rate).toBeLessThanOrEqual(1);
  });

  it('counts decrease monotonically (views >= trials >= purchases)', async () => {
    const funnel = await getConversionFunnel('creator-1', '30d');
    expect(funnel.views).toBeGreaterThanOrEqual(funnel.trial_starts);
    expect(funnel.trial_starts).toBeGreaterThanOrEqual(funnel.purchases);
  });
});
