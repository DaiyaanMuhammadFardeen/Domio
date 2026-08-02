import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { isLocale, translate, type Locale } from './i18n';

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
