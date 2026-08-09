import { describe, expect, it } from 'vitest';
import {
  isLocaleId,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  RTL_LOCALES,
  isRtlLocale,
  toHtmlLang,
  toHtmlDir,
} from './locales.js';

describe('locales', () => {
  it('exports DEFAULT_LOCALE as en', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('SUPPORTED_LOCALES contains 9 entries (en, bn, es, fr, de, ja, zh-CN, ar, ur)', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(9);
  });

  it('SUPPORTED_LOCALES includes all required locales', () => {
    const expected = ['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN', 'ar', 'ur'];
    for (const loc of expected) {
      expect(SUPPORTED_LOCALES).toContain(loc);
    }
  });

  it('isLocaleId returns true for valid locale ids', () => {
    expect(isLocaleId('en')).toBe(true);
    expect(isLocaleId('bn')).toBe(true);
    expect(isLocaleId('zh-CN')).toBe(true);
    expect(isLocaleId('ar')).toBe(true);
    expect(isLocaleId('ur')).toBe(true);
  });

  it('isLocaleId returns false for invalid values', () => {
    expect(isLocaleId('xx')).toBe(false);
    expect(isLocaleId('')).toBe(false);
    expect(isLocaleId('EN')).toBe(false);
  });

  it('marks ar and ur as RTL locales', () => {
    expect(RTL_LOCALES.has('ar')).toBe(true);
    expect(RTL_LOCALES.has('ur')).toBe(true);
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('ur')).toBe(true);
  });

  it('marks Bengali as LTR (it is not an RTL script)', () => {
    expect(RTL_LOCALES.has('bn')).toBe(false);
    expect(isRtlLocale('bn')).toBe(false);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('zh-CN')).toBe(false);
  });

  it('toHtmlLang returns the locale id unchanged', () => {
    expect(toHtmlLang('en')).toBe('en');
    expect(toHtmlLang('bn')).toBe('bn');
    expect(toHtmlLang('zh-CN')).toBe('zh-CN');
    expect(toHtmlLang('ar')).toBe('ar');
  });

  it('toHtmlDir returns rtl for RTL locales and ltr otherwise', () => {
    expect(toHtmlDir('ar')).toBe('rtl');
    expect(toHtmlDir('ur')).toBe('rtl');
    expect(toHtmlDir('en')).toBe('ltr');
    expect(toHtmlDir('bn')).toBe('ltr');
    expect(toHtmlDir('zh-CN')).toBe('ltr');
  });
});
