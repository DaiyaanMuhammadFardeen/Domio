'use client';

import { createContext, useContext, useMemo, useCallback, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { detectLocale, setLocale as persistLocale, type LocaleId, t, formatPrice } from '@/lib/i18n';

interface LocaleCtx {
  locale: LocaleId;
  setLocale: (l: LocaleId) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatPrice: (priceCents: number, currency: string, isFree: boolean) => string;
}

const LocaleContext = createContext<LocaleCtx>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  formatPrice: (c, _cur, free) => (free ? 'Free' : `$${(c / 100).toFixed(2)}`),
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>('en');

  // Hydrate from localStorage after mount
  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((l: LocaleId) => {
    setLocaleState(l);
    persistLocale(l);
  }, []);

  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      setLocale,
      t: (key: string, params?: Record<string, string | number>) =>
        t(key, locale, params),
      formatPrice: (priceCents: number, currency: string, isFree: boolean) =>
        formatPrice(priceCents, currency, locale, isFree),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleCtx {
  return useContext(LocaleContext);
}
