/**
 * Pure analytics computation tests (Phase 19 Wave 3).
 *
 * Tests: conversion/refund rates, MRR sum, top geos, period validation.
 */

import { describe, it, expect } from 'vitest';
import { computeAnalyticsBody, validatePeriod } from './analytics.js';
import { InvalidPeriodError } from './types.js';
import type { RevenueEventRow, PaymentIntentRow, GeoCount } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRevenueEvent(overrides: Partial<RevenueEventRow> = {}): RevenueEventRow {
  return {
    id: overrides.id ?? 'rev-1',
    listing_id: overrides.listing_id ?? 'list-1',
    seller_id: overrides.seller_id ?? 'creator-1',
    workspace_id: overrides.workspace_id ?? 'ws-1',
    currency: overrides.currency ?? 'USD',
    gross_cents: overrides.gross_cents ?? 1000,
    fee_cents: overrides.fee_cents ?? 300,
    net_cents: overrides.net_cents ?? 700,
    payout_status: overrides.payout_status ?? 'eligible',
    period_month: overrides.period_month ?? '2025-06',
    event_type: overrides.event_type ?? 'purchase',
  };
}

function makePaymentIntent(overrides: Partial<PaymentIntentRow> = {}): PaymentIntentRow {
  return {
    id: overrides.id ?? 'pi-1',
    workspace_id: overrides.workspace_id ?? 'ws-1',
    buyer_id: overrides.buyer_id ?? 'buyer-1',
    listing_id: overrides.listing_id ?? 'list-1',
    purchase_id: overrides.purchase_id ?? 'purchase-1',
    provider: overrides.provider ?? 'stripe',
    currency: overrides.currency ?? 'USD',
    gross_cents: overrides.gross_cents ?? 1000,
    fee_cents: overrides.fee_cents ?? 300,
    net_cents: overrides.net_cents ?? 700,
    status: overrides.status ?? 'succeeded',
  };
}

// ---------------------------------------------------------------------------
// validatePeriod
// ---------------------------------------------------------------------------

describe('validatePeriod', () => {
  it('accepts valid YYYY-MM format', () => {
    expect(() => validatePeriod('2025-06')).not.toThrow();
    expect(() => validatePeriod('2024-12')).not.toThrow();
    expect(() => validatePeriod('2000-01')).not.toThrow();
  });

  it('rejects invalid formats', () => {
    expect(() => validatePeriod('2025/06')).toThrow(InvalidPeriodError);
    expect(() => validatePeriod('2025-6')).toThrow(InvalidPeriodError);
    expect(() => validatePeriod('25-06')).toThrow(InvalidPeriodError);
    expect(() => validatePeriod('2025-06-01')).toThrow(InvalidPeriodError);
    expect(() => validatePeriod('')).toThrow(InvalidPeriodError);
    expect(() => validatePeriod('abc')).toThrow(InvalidPeriodError);
  });
});

// ---------------------------------------------------------------------------
// computeAnalyticsBody
// ---------------------------------------------------------------------------

describe('computeAnalyticsBody', () => {
  it('computes downloads = installs + revenue_events count', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 10,
      revenue_events: [makeRevenueEvent(), makeRevenueEvent({ id: 'rev-2' })],
      payments: [],
      refunds: 0,
      geos: [],
    });
    expect(result.downloads).toBe(12);
    expect(result.installs).toBe(10);
  });

  it('computes MRR from subscription-kind revenue events', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 5,
      revenue_events: [
        makeRevenueEvent({ event_type: 'subscription', net_cents: 500 }),
        makeRevenueEvent({ event_type: 'subscription', net_cents: 300, id: 'rev-2' }),
        makeRevenueEvent({ event_type: 'purchase', net_cents: 1000, id: 'rev-3' }),
      ],
      payments: [],
      refunds: 0,
      geos: [],
    });
    expect(result.mrr_cents).toBe(800); // only subscription events
  });

  it('computes conversion_rate = successful payments / installs', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 20,
      revenue_events: [],
      payments: [
        makePaymentIntent({ status: 'succeeded' }),
        makePaymentIntent({ status: 'succeeded', id: 'pi-2' }),
        makePaymentIntent({ status: 'failed', id: 'pi-3' }),
      ],
      refunds: 0,
      geos: [],
    });
    expect(result.conversion_rate).toBeCloseTo(0.1); // 2/20
  });

  it('conversion_rate = 0 when no installs', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 0,
      revenue_events: [],
      payments: [],
      refunds: 0,
      geos: [],
    });
    expect(result.conversion_rate).toBe(0);
  });

  it('computes refund_rate = refunds / installs', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 100,
      revenue_events: [],
      payments: [],
      refunds: 5,
      geos: [],
    });
    expect(result.refund_rate).toBeCloseTo(0.05);
  });

  it('refund_rate = 0 when no installs', () => {
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 0,
      revenue_events: [],
      payments: [],
      refunds: 0,
      geos: [],
    });
    expect(result.refund_rate).toBe(0);
  });

  it('returns top_geos sorted desc, top 5', () => {
    const geos: GeoCount[] = [
      { country_code: 'US', count: 10 },
      { country_code: 'BD', count: 50 },
      { country_code: 'IN', count: 30 },
      { country_code: 'UK', count: 5 },
      { country_code: 'DE', count: 20 },
      { country_code: 'JP', count: 15 },
      { country_code: 'FR', count: 2 },
    ];
    const result = computeAnalyticsBody('creator-1', '2025-06', {
      installs: 1,
      revenue_events: [],
      payments: [],
      refunds: 0,
      geos,
    });
    expect(result.top_geos).toHaveLength(5);
    expect(result.top_geos[0]!.country_code).toBe('BD');
    expect(result.top_geos[1]!.country_code).toBe('IN');
    expect(result.top_geos[2]!.country_code).toBe('DE');
    expect(result.top_geos[3]!.country_code).toBe('JP');
    expect(result.top_geos[4]!.country_code).toBe('US');
  });

  it('sets creator_id and period correctly', () => {
    const result = computeAnalyticsBody('creator-42', '2025-11', {
      installs: 0,
      revenue_events: [],
      payments: [],
      refunds: 0,
      geos: [],
    });
    expect(result.creator_id).toBe('creator-42');
    expect(result.period).toBe('2025-11');
  });

  it('sets computed_at to a recent timestamp', () => {
    const before = Date.now();
    const result = computeAnalyticsBody('c', '2025-06', {
      installs: 0,
      revenue_events: [],
      payments: [],
      refunds: 0,
      geos: [],
    });
    const after = Date.now();
    expect(result.computed_at).toBeGreaterThanOrEqual(before);
    expect(result.computed_at).toBeLessThanOrEqual(after);
  });
});
