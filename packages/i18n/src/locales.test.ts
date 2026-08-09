import { describe, expect, it } from 'vitest';
import {
  isLocaleId,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from './locales.js';

describe('locales', () => {
  it('exports DEFAULT_LOCALE as en', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('SUPPORTED_LOCALES contains exactly 7 entries', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(7);
  });

  it('SUPPORTED_LOCALES includes all required locales', () => {
    const expected = ['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN'];
    for (const loc of expected) {
      expect(SUPPORTED_LOCALES).toContain(loc);
    }
  });

  it('isLocaleId returns true for valid locale ids', () => {
    expect(isLocaleId('en')).toBe(true);
    expect(isLocaleId('bn')).toBe(true);
    expect(isLocaleId('zh-CN')).toBe(true);
  });

  it('isLocaleId returns false for invalid values', () => {
    expect(isLocaleId('xx')).toBe(false);
    expect(isLocaleId('')).toBe(false);
    expect(isLocaleId('EN')).toBe(false);
  });
});
