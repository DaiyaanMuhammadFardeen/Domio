/**
 * Currency formatting with locale-aware rendering.
 *
 * Input is always **integer cents** (or sen/paisa/centime subunits).
 * No floating-point values are accepted.
 *
 * Supported currencies:
 *  - `BDT` (Bangladeshi Taka) — ৳ prefix
 *  - `USD` (US Dollar)        — $ prefix
 *  - `EUR` (Euro)             — € prefix
 *
 * Bengali locale (`bn`) renders BDT with Bengali digits (৳১,২৫০).
 * All other locales use standard ASCII digits (৳1,250 / $1,250 / €1,250).
 */

import { toBengaliDigits } from './bengali-digits.js';
import type { LocaleId } from './locales.js';

export type CurrencyCode = 'BDT' | 'USD' | 'EUR';

interface CurrencyConfig {
  /** Symbol placed before the numeric value. */
  symbol: string;
  /** Number of decimal subunits per base unit (100 for all supported currencies). */
  subunits: number;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  BDT: { symbol: '\u09F3', subunits: 100 }, // ৳
  USD: { symbol: '$', subunits: 100 },
  EUR: { symbol: '\u20AC', subunits: 100 }, // €
};

/**
 * Format an integer cents amount into a human-readable currency string.
 *
 * @param amountCents - Non-negative integer in the smallest currency unit.
 * @param currency    - ISO-style currency code.
 * @param locale      - Target locale for rendering.
 * @returns Formatted string, e.g. `'৳১,২৫০'` or `'$12.50'`.
 *
 * @throws {RangeError} If `amountCents` is negative or not an integer.
 *
 * @example
 * ```ts
 * formatCurrency(125000, 'BDT', 'bn') // '৳১,২৫,০০০'  (Bengali digits)
 * formatCurrency(125000, 'BDT', 'en') // '৳1,25,000'
 * formatCurrency(1250, 'USD', 'en')   // '$12.50'
 * formatCurrency(1250, 'EUR', 'fr')   // '€12,50'
 * ```
 */
export function formatCurrency(
  amountCents: number,
  currency: CurrencyCode,
  locale: LocaleId,
): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new RangeError(
      `amountCents must be a non-negative integer, got ${amountCents}`,
    );
  }

  const config = CURRENCIES[currency];
  const whole = Math.floor(amountCents / config.subunits);
  const frac = amountCents % config.subunits;

  // Build the numeric string with thousands separators.
  const wholeStr = whole.toLocaleString('en-US');
  const fracStr = String(frac).padStart(2, '0');
  const needsDecimal = frac > 0;
  const numeric = needsDecimal ? `${wholeStr}.${fracStr}` : wholeStr;

  // Bengali locale → substitute ASCII digits with Bengali glyphs.
  const rendered =
    locale === 'bn' ? toBengaliDigits(numeric) : numeric;

  return `${config.symbol}${rendered}`;
}
