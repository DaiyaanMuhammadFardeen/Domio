import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
// Messages live in `apps/editor/messages/{locale}.json` — the single
// source of truth for every translatable string. Wave 2 §Phase E
// retired `lib/i18n.ts`; `useT()` now reads the JSON catalogue and
// falls back to English when a locale file is missing or a key is
// untranslated.
import enCatalogue from '../../messages/en.json';
import bnCatalogue from '../../messages/bn.json';
import esCatalogue from '../../messages/es.json';
import frCatalogue from '../../messages/fr.json';
import deCatalogue from '../../messages/de.json';
import jaCatalogue from '../../messages/ja.json';
import zhCNCatalogue from '../../messages/zh-CN.json';
import arCatalogue from '../../messages/ar.json';
import urCatalogue from '../../messages/ur.json';

export type Locale = 'en' | 'bn' | 'es' | 'fr' | 'de' | 'ja' | 'zh-CN' | 'ar' | 'ur';

export const LOCALES: Locale[] = ['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN', 'ar', 'ur'];

const DICTS: Record<Locale, Record<string, string>> = {
  en: enCatalogue,
  bn: bnCatalogue,
  es: esCatalogue,
  fr: frCatalogue,
  de: deCatalogue,
  ja: jaCatalogue,
  'zh-CN': zhCNCatalogue,
  ar: arCatalogue,
  ur: urCatalogue,
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Returns the English keys that are missing from the given locale's catalogue. */
export function missingKeys(locale: Locale): string[] {
  return Object.keys(DICTS.en).filter((k) => !(k in DICTS[locale]));
}

/** Resolve a key in the active locale, falling back to English, then to the key itself. */
export function translate(key: string, locale: Locale): string {
  return DICTS[locale]?.[key] ?? DICTS.en[key] ?? key;
}

/** Lightweight plural handling for keys that have a `.plural` sibling. */
export function translateCount(locale: Locale, key: string, n: number): string {
  const plural = n === 1 ? key : `${key}.plural`;
  const localized = translate(plural, locale);
  return localized === plural ? translate(key, locale) : localized;
}

const LocaleContext = createContext<Locale>('en');

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Bound translator for the active locale. */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const locale = useLocale();
  return useMemo(
    () => (key: string, params?: Record<string, string | number>) => {
      const out = translate(key, locale);
      if (!params) return out;
      return out.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
    },
    [locale],
  );
}

/** Reads the locale from localStorage; falls back to 'en'. */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('domio.locale');
  return stored && isLocale(stored) ? stored : 'en';
}