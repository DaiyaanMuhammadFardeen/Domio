/**
 * Marketplace pricing calculator (Phase 19 Wave 1).
 *
 * Integer-cents correctness: 70/30 split fee rounding,
 * free model zero, fx override, currency passthrough USD|BDT|EUR.
 */

import type { PriceBreakdown, PricingModel, PayoutPolicy } from './types.js';

/** Valid currencies for the marketplace. */
export type MarketplaceCurrency = 'USD' | 'BDT' | 'EUR';

const VALID_CURRENCIES: ReadonlySet<string> = new Set(['USD', 'BDT', 'EUR']);

/**
 * Calculate the price breakdown for a marketplace listing.
 *
 * @param priceCents  — listing price in integer cents (0 = free)
 * @param currency    — ISO 4217 currency code (USD | BDT | EUR)
 * @param model       — pricing model (free | one_time | subscription | team_seats | enterprise_quote)
 * @param policy      — payout policy (split bps)
 * @returns PriceBreakdown with creator share and platform fee
 */
export function calculatePrice(
  priceCents: number,
  currency: string,
  model: PricingModel,
  policy: PayoutPolicy,
): PriceBreakdown {
  // Validate currency
  const cur = normalizeCurrency(currency);

  // Free model: zero everything
  if (model === 'free' || priceCents === 0) {
    return {
      priceCents: 0,
      currency: cur,
      model,
      creatorShareCents: 0,
      platformFeeCents: 0,
    };
  }

  // Enterprise quote: return the quoted price with zero fees (negotiated externally)
  if (model === 'enterprise_quote') {
    return {
      priceCents,
      currency: cur,
      model,
      creatorShareCents: priceCents,
      platformFeeCents: 0,
    };
  }

  // Standard split: creator gets splitCreatorBps / 10000 of price
  // Platform fee = price - creator share (ensures no cents lost to rounding)
  const creatorShareCents = Math.floor(
    (priceCents * policy.splitCreatorBps) / 10000,
  );
  const platformFeeCents = priceCents - creatorShareCents;

  return {
    priceCents,
    currency: cur,
    model,
    creatorShareCents,
    platformFeeCents,
  };
}

/**
 * Normalize and validate a currency code.
 * Returns the uppercased currency if valid, throws otherwise.
 */
export function normalizeCurrency(currency: string): string {
  const cur = currency.toUpperCase();
  if (!VALID_CURRENCIES.has(cur)) {
    throw new Error(`Invalid marketplace currency: ${currency}. Must be one of: USD, BDT, EUR`);
  }
  return cur;
}
