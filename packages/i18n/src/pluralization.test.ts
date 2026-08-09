import { describe, expect, it } from 'vitest';
import { getPluralCategory } from './pluralization.js';
import type { LocaleId } from './locales.js';

describe('getPluralCategory', () => {
  describe('English', () => {
    it('returns one for count 1', () => {
      expect(getPluralCategory('en', 1)).toBe('one');
    });

    it('returns other for count 0', () => {
      expect(getPluralCategory('en', 0)).toBe('other');
    });

    it('returns other for count 2', () => {
      expect(getPluralCategory('en', 2)).toBe('other');
    });

    it('returns other for count 100', () => {
      expect(getPluralCategory('en', 100)).toBe('other');
    });
  });

  describe('Bengali', () => {
    it('returns one for count 1', () => {
      expect(getPluralCategory('bn', 1)).toBe('one');
    });

    it('returns other for count 0', () => {
      expect(getPluralCategory('bn', 0)).toBe('other');
    });

    it('returns other for count 2', () => {
      expect(getPluralCategory('bn', 2)).toBe('other');
    });

    it('returns other for count 5', () => {
      expect(getPluralCategory('bn', 5)).toBe('other');
    });

    it('returns other for count 99', () => {
      expect(getPluralCategory('bn', 99)).toBe('other');
    });
  });

  describe('Japanese and Chinese (no plural distinction)', () => {
    const noPluralLocales: LocaleId[] = ['ja', 'zh-CN'];

    for (const locale of noPluralLocales) {
      it(`${locale} always returns other`, () => {
        expect(getPluralCategory(locale, 0)).toBe('other');
        expect(getPluralCategory(locale, 1)).toBe('other');
        expect(getPluralCategory(locale, 2)).toBe('other');
        expect(getPluralCategory(locale, 999)).toBe('other');
      });
    }
  });

  describe('negative counts', () => {
    it('uses absolute value for category determination', () => {
      expect(getPluralCategory('en', -1)).toBe('one');
      expect(getPluralCategory('en', -2)).toBe('other');
    });
  });
});
