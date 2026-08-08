/**
 * Pricing calculator tests (Phase 19 Wave 1).
 *
 * Integer-cents correctness: 70/30 split fee rounding, free model zero,
 * fx override, currency passthrough USD|BDT|EUR.
 */

import { describe, it, expect } from 'vitest';
import { calculatePrice, normalizeCurrency } from './pricing.js';
import type { PayoutPolicy } from './types.js';

const DEFAULT_POLICY: PayoutPolicy = {
  id: 'default',
  splitCreatorBps: 7000,
  splitPlatformBps: 3000,
  minPayoutCents: 5000,
  firstPayoutHoldDays: 30,
  updatedAt: new Date(),
  updatedBy: null,
};

describe('calculatePrice', () => {
  // -------------------------------------------------------------------------
  // Free model
  // -------------------------------------------------------------------------

  it('free model returns all zeros', () => {
    const result = calculatePrice(0, 'USD', 'free', DEFAULT_POLICY);
    expect(result).toEqual({
      priceCents: 0,
      currency: 'USD',
      model: 'free',
      creatorShareCents: 0,
      platformFeeCents: 0,
    });
  });

  it('free model ignores nonzero priceCents', () => {
    const result = calculatePrice(500, 'USD', 'free', DEFAULT_POLICY);
    expect(result.priceCents).toBe(0);
    expect(result.creatorShareCents).toBe(0);
    expect(result.platformFeeCents).toBe(0);
  });

  // -------------------------------------------------------------------------
  // One-time pricing (70/30 split)
  // -------------------------------------------------------------------------

  it('one_time: $10.00 (1000 cents) → creator $7.00, platform $3.00', () => {
    const result = calculatePrice(1000, 'USD', 'one_time', DEFAULT_POLICY);
    expect(result.priceCents).toBe(1000);
    expect(result.creatorShareCents).toBe(700);
    expect(result.platformFeeCents).toBe(300);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(1000);
  });

  it('one_time: $1.00 (100 cents) → creator $0.70, platform $0.30', () => {
    const result = calculatePrice(100, 'USD', 'one_time', DEFAULT_POLICY);
    expect(result.creatorShareCents).toBe(70);
    expect(result.platformFeeCents).toBe(30);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(100);
  });

  it('one_time: $0.99 (99 cents) → rounding handled correctly', () => {
    const result = calculatePrice(99, 'USD', 'one_time', DEFAULT_POLICY);
    // 99 * 7000 / 10000 = 69.3 → floor = 69
    expect(result.creatorShareCents).toBe(69);
    expect(result.platformFeeCents).toBe(30);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(99);
  });

  it('one_time: $0.01 (1 cent) → creator $0, platform $1 (rounding favors platform)', () => {
    const result = calculatePrice(1, 'USD', 'one_time', DEFAULT_POLICY);
    // 1 * 7000 / 10000 = 0.7 → floor = 0
    expect(result.creatorShareCents).toBe(0);
    expect(result.platformFeeCents).toBe(1);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(1);
  });

  it('one_time: $0.03 (3 cents) → creator $0, platform $3', () => {
    const result = calculatePrice(3, 'USD', 'one_time', DEFAULT_POLICY);
    // 3 * 7000 / 10000 = 2.1 → floor = 2
    expect(result.creatorShareCents).toBe(2);
    expect(result.platformFeeCents).toBe(1);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(3);
  });

  it('one_time: $99.99 (9999 cents) → rounding correctness', () => {
    const result = calculatePrice(9999, 'USD', 'one_time', DEFAULT_POLICY);
    // 9999 * 7000 / 10000 = 6999.3 → floor = 6999
    expect(result.creatorShareCents).toBe(6999);
    expect(result.platformFeeCents).toBe(3000);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(9999);
  });

  // -------------------------------------------------------------------------
  // Subscription pricing
  // -------------------------------------------------------------------------

  it('subscription: same split as one_time', () => {
    const result = calculatePrice(2000, 'USD', 'subscription', DEFAULT_POLICY);
    expect(result.creatorShareCents).toBe(1400);
    expect(result.platformFeeCents).toBe(600);
    expect(result.model).toBe('subscription');
  });

  // -------------------------------------------------------------------------
  // Team seats pricing
  // -------------------------------------------------------------------------

  it('team_seats: same split as one_time', () => {
    const result = calculatePrice(5000, 'USD', 'team_seats', DEFAULT_POLICY);
    expect(result.creatorShareCents).toBe(3500);
    expect(result.platformFeeCents).toBe(1500);
  });

  // -------------------------------------------------------------------------
  // Enterprise quote
  // -------------------------------------------------------------------------

  it('enterprise_quote: full amount to creator, zero platform fee', () => {
    const result = calculatePrice(50000, 'USD', 'enterprise_quote', DEFAULT_POLICY);
    expect(result.priceCents).toBe(50000);
    expect(result.creatorShareCents).toBe(50000);
    expect(result.platformFeeCents).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Currency passthrough
  // -------------------------------------------------------------------------

  it('USD currency passthrough', () => {
    const result = calculatePrice(1000, 'USD', 'one_time', DEFAULT_POLICY);
    expect(result.currency).toBe('USD');
  });

  it('BDT currency passthrough', () => {
    const result = calculatePrice(1000, 'BDT', 'one_time', DEFAULT_POLICY);
    expect(result.currency).toBe('BDT');
  });

  it('EUR currency passthrough', () => {
    const result = calculatePrice(1000, 'EUR', 'one_time', DEFAULT_POLICY);
    expect(result.currency).toBe('EUR');
  });

  it('currency is normalized to uppercase', () => {
    const result = calculatePrice(1000, 'usd', 'one_time', DEFAULT_POLICY);
    expect(result.currency).toBe('USD');
  });

  // -------------------------------------------------------------------------
  // Custom policy
  // -------------------------------------------------------------------------

  it('custom 80/20 split', () => {
    const policy = { ...DEFAULT_POLICY, splitCreatorBps: 8000, splitPlatformBps: 2000 };
    const result = calculatePrice(1000, 'USD', 'one_time', policy);
    expect(result.creatorShareCents).toBe(800);
    expect(result.platformFeeCents).toBe(200);
  });

  it('custom 50/50 split', () => {
    const policy = { ...DEFAULT_POLICY, splitCreatorBps: 5000, splitPlatformBps: 5000 };
    const result = calculatePrice(1000, 'USD', 'one_time', policy);
    expect(result.creatorShareCents).toBe(500);
    expect(result.platformFeeCents).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Large amounts
  // -------------------------------------------------------------------------

  it('one_time: $10000.00 (1000000 cents) → correct split', () => {
    const result = calculatePrice(1000000, 'USD', 'one_time', DEFAULT_POLICY);
    expect(result.creatorShareCents).toBe(700000);
    expect(result.platformFeeCents).toBe(300000);
    expect(result.creatorShareCents + result.platformFeeCents).toBe(1000000);
  });
});

describe('normalizeCurrency', () => {
  it('normalizes lowercase to uppercase', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('eur')).toBe('EUR');
    expect(normalizeCurrency('bdt')).toBe('BDT');
  });

  it('passes through already-uppercase', () => {
    expect(normalizeCurrency('USD')).toBe('USD');
  });

  it('throws on invalid currency', () => {
    expect(() => normalizeCurrency('GBP')).toThrow('Invalid marketplace currency');
    expect(() => normalizeCurrency('XYZ')).toThrow('Invalid marketplace currency');
  });
});
