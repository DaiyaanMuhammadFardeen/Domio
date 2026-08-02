import { describe, expect, it } from 'vitest';
import { LOCALES, missingKeys, translate } from './i18n.js';

describe('i18n', () => {
  it('has complete dictionaries for all 7 locales (no missing English keys)', () => {
    for (const locale of LOCALES) {
      expect(missingKeys(locale), `missing keys for ${locale}`).toEqual([]);
    }
  });

  it('has 7 distinct locales', () => {
    expect(LOCALES).toHaveLength(7);
    expect(LOCALES).toEqual(['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN']);
  });

  it('falls back to English for unknown keys', () => {
    expect(translate('does.not.exist', 'fr')).toBe('does.not.exist');
    expect(translate('app.save', 'ja')).toBe('保存');
  });

  it('returns the key itself when neither locale nor English has it', () => {
    expect(translate('totally.unknown.key', 'en')).toBe('totally.unknown.key');
  });

  it('translates core panel strings in every locale', () => {
    const checks: Array<[string, string]> = [
      ['app.save', 'fr'],
      ['promote.title', 'de'],
      ['library.updateAvailable', 'es'],
      ['stickers.title', 'zh-CN'],
      ['icons.title', 'bn'],
      ['props.title', 'ja'],
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
