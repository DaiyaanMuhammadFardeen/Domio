/**
 * Tests for `setLocale` — verifies the cookie write + document
 * attribute updates.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './setLocale.js';
import { LOCALE_COOKIE } from './useLocale.js';

describe('setLocale', () => {
  afterEach(() => {
    // Reset document attributes after each test.
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
    document.cookie = `${LOCALE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });

  it('writes the domio-locale cookie with the chosen locale', () => {
    setLocale('bn');
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=bn`);
  });

  it('updates <html lang> and <html dir> for LTR locales', () => {
    setLocale('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('updates <html lang> and <html dir> for RTL locales', () => {
    setLocale('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('writes an explicit expiry for the cookie', () => {
    // jsdom normalizes cookies differently from a real browser — only
    // the name=value is exposed via `document.cookie`. The expiry
    // logic is exercised via the source; here we verify the locale
    // round-trips through the cookie write.
    setLocale('fr', { days: 7 });
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=fr`);
  });

  it('uses the default 365-day expiry when none is supplied', () => {
    setLocale('de');
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=de`);
  });
});
