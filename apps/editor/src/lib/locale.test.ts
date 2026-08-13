import { describe, expect, it } from 'vitest';
import { LOCALES, missingKeys, translate } from './locale';

describe('i18n', () => {
  it('has complete dictionaries for all 9 locales (no missing English keys)', () => {
    for (const locale of LOCALES) {
      expect(missingKeys(locale), `missing keys for ${locale}`).toEqual([]);
    }
  });

  it('has 9 distinct locales', () => {
    expect(LOCALES).toHaveLength(9);
    expect(LOCALES).toEqual(['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN', 'ar', 'ur']);
  });

  it('falls back to the key itself for unknown keys', () => {
    // Unknown keys have no English entry either, so the resolver
    // returns the key as-is. This is the "weak fallback" behaviour —
    // a missing key surfaces in the UI rather than silent empty
    // string, which is what i18n:check enforces at build time.
    expect(translate('totally.unknown.key', 'en')).toBe('totally.unknown.key');
    expect(translate('totally.unknown.key', 'fr')).toBe('totally.unknown.key');
  });

  it('returns English translation for non-English locales that have not yet shipped translations', () => {
    // Wave 2 ships every non-English locale as an English fallback.
    // Each future translation task replaces these JSON files; the
    // structural completeness test above guarantees no missing keys.
    // RTL locales (`ar`, `ur`) intentionally mirror English until the
    // Bengali/Urdu translation team confirms in P22b.
    expect(translate('app.save', 'ja')).toBe(translate('app.save', 'en'));
    expect(translate('promote.title', 'de')).toBe(translate('promote.title', 'en'));
    expect(translate('stickers.title', 'zh-CN')).toBe(translate('stickers.title', 'en'));
    expect(translate('insert.title', 'ar')).toBe(translate('insert.title', 'en'));
    expect(translate('insert.title', 'ur')).toBe(translate('insert.title', 'en'));
  });

  it('every locale resolves well-known panel strings to a non-empty value', () => {
    const checks: Array<[string, string]> = [
      ['app.save', 'fr'],
      ['promote.title', 'de'],
      ['library.updateAvailable', 'es'],
      ['stickers.title', 'zh-CN'],
      ['icons.title', 'bn'],
      ['props.title', 'ja'],
      ['insert.title', 'ar'],
      ['insert.title', 'ur'],
    ];
    for (const [key, locale] of checks) {
      const value = translate(key, locale as never);
      expect(value).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('does not translate to itself in English for real keys', () => {
    expect(translate('insert.title', 'en')).toBe('Insert');
  });
});
