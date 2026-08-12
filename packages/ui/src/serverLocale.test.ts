/**
 * Tests for `resolveLocaleFromHeaders` — server-side locale
 * resolution for Next.js layouts and middleware.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { describe, expect, it } from 'vitest';
import { resolveLocaleFromHeaders } from './serverLocale.js';

describe('resolveLocaleFromHeaders', () => {
  it('falls back to DEFAULT_LOCALE ("en") when no hints are present', () => {
    const result = resolveLocaleFromHeaders({});
    expect(result.locale).toBe('en');
    expect(result.lang).toBe('en');
    expect(result.dir).toBe('ltr');
  });

  it('uses the domio-locale cookie when set and valid', () => {
    const result = resolveLocaleFromHeaders({
      cookie: 'domio-locale=bn; other=value',
    });
    expect(result.locale).toBe('bn');
    expect(result.lang).toBe('bn');
  });

  it('falls back to accept-language when cookie is missing', () => {
    const result = resolveLocaleFromHeaders({
      acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.5',
    });
    expect(result.locale).toBe('fr');
    expect(result.dir).toBe('ltr');
  });

  it('flips dir to rtl for RTL locales', () => {
    const result = resolveLocaleFromHeaders({
      acceptLanguage: 'ar',
    });
    expect(result.locale).toBe('ar');
    expect(result.dir).toBe('rtl');
  });

  it('ignores malformed cookie values', () => {
    const result = resolveLocaleFromHeaders({
      cookie: 'domio-locale=xx; other=value',
      acceptLanguage: 'bn',
    });
    expect(result.locale).toBe('bn');
  });
});
