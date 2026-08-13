import { describe, expect, it } from 'vitest';
import { LOCALE_COOKIE, readLocaleFromCookie, readLocaleFromNavigator } from './useLocale.js';

describe('readLocaleFromCookie', () => {
  it('returns null on missing cookie header', () => {
    expect(readLocaleFromCookie(null)).toBeNull();
    expect(readLocaleFromCookie(undefined)).toBeNull();
    expect(readLocaleFromCookie('')).toBeNull();
  });

  it('returns null when cookie not present', () => {
    expect(readLocaleFromCookie('other=value')).toBeNull();
  });

  it('returns the locale when domio-locale is set and valid', () => {
    expect(readLocaleFromCookie(`${LOCALE_COOKIE}=fr`)).toBe('fr');
    expect(readLocaleFromCookie(`a=1; ${LOCALE_COOKIE}=bn; b=2`)).toBe('bn');
  });

  it('returns null when domio-locale value is not a supported locale', () => {
    expect(readLocaleFromCookie(`${LOCALE_COOKIE}=xx`)).toBeNull();
  });
});

describe('readLocaleFromNavigator', () => {
  it('reads from navigator.languages when present', () => {
    // jsdom provides a navigator; we set languages and verify the
    // function returns a supported locale id.
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['bn-BD', 'en'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'bn-BD',
    });
    expect(readLocaleFromNavigator()).toBe('bn');
  });

  it('falls back to navigator.language when languages is empty', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: [],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'fr',
    });
    expect(readLocaleFromNavigator()).toBe('fr');
  });

  it('returns null when no supported language matches', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['xx'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'xx',
    });
    expect(readLocaleFromNavigator()).toBeNull();
  });
});
