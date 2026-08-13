/**
 * Localization service — Wave 2 §S2.9 unit tests.
 *
 * Verifies the bootstrap seam formats values via Intl.NumberFormat
 * with graceful locale/currency fallback.
 */

import { describe, expect, it } from 'vitest';
import {
  formatPreview,
  formatPreviewSync,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
} from './localization-service';

describe('localization-service', () => {
  it('exposes a starter catalog of locales and currencies', () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(0);
  });

  it('formatPreviewSync formats decimal values', () => {
    const res = formatPreviewSync({ value: 1234.56, locale: 'en-US' });
    expect(res.fallback).toBe(true);
    expect(res.formatted).toBe('1,234.56');
  });

  it('formatPreviewSync formats currency values', () => {
    const res = formatPreviewSync({
      value: 1234.56,
      locale: 'de-DE',
      style: 'currency',
      currency: 'EUR',
    });
    expect(res.formatted).toContain('1.234');
    expect(res.formatted).toContain('€');
  });

  it('formatPreviewSync honours decimals override', () => {
    const res = formatPreviewSync({
      value: 1234.5,
      locale: 'en-US',
      decimals: 0,
    });
    expect(res.formatted).toBe('1,235');
  });

  it('formatPreviewSync falls back to en-US for invalid locale strings', () => {
    const res = formatPreviewSync({ value: 42, locale: 'not-a-locale' });
    expect(res.effectiveLocale).toBe('en-US');
    expect(res.formatted).toBe('42');
  });

  it('formatPreview async returns the same shape as the sync variant', async () => {
    const res = await formatPreview({ value: 1000, locale: 'ja-JP' });
    expect(res.fallback).toBe(true);
    expect(res.formatted).toBeTruthy();
  });
});
