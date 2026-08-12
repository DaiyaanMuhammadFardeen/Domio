'use client';

/**
 * useLocale — read the current locale from cookie, then navigator, then default.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Source order:
 *   1. `domio-locale` cookie (set by the server layout or user action).
 *   2. `navigator.language` (first matching supported locale).
 *   3. `DEFAULT_LOCALE` ('en').
 */

import { useMemo } from 'react';

import {
  DEFAULT_LOCALE,
  isLocaleId,
  type LocaleId,
} from '@domio/i18n';

export const LOCALE_COOKIE = 'domio-locale';

export function readLocaleFromCookie(
  cookieHeader: string | null | undefined,
): LocaleId | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === LOCALE_COOKIE && isLocaleId(v)) return v;
  }
  return null;
}

export function readLocaleFromNavigator(): LocaleId | null {
  if (typeof navigator === 'undefined') return null;
  const candidates = (navigator.languages && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
  ).filter((l): l is string => typeof l === 'string' && l.length > 0);
  for (const c of candidates) {
    const lower = c.toLowerCase();
    if (isLocaleId(lower)) return lower;
    const base = lower.split('-')[0];
    if (base && isLocaleId(base)) return base;
  }
  return null;
}

export interface UseLocaleResult {
  locale: LocaleId;
  dir: 'ltr' | 'rtl';
  /** Returns a translated string from a flat message catalogue; falls back to fallback then key. */
  t(key: string, fallback?: string): string;
}

/**
 * Resolve the user's current locale synchronously on the client.
 *
 * `catalogue` is an optional flat key->message map. If a key is missing,
 * returns `fallback` if provided, otherwise the key itself.
 */
export function useLocale(
  catalogue?: Readonly<Record<string, string>>,
): UseLocaleResult {
  return useMemo<UseLocaleResult>(() => {
    let locale: LocaleId = DEFAULT_LOCALE;
    if (typeof document !== 'undefined') {
      const fromCookie = readLocaleFromCookie(document.cookie);
      if (fromCookie) {
        locale = fromCookie;
      } else {
        const fromNav = readLocaleFromNavigator();
        if (fromNav) locale = fromNav;
      }
    }
    const isRtl = locale === 'ar' || locale === 'ur';
    const dir: 'ltr' | 'rtl' = isRtl ? 'rtl' : 'ltr';
    return {
      locale,
      dir,
      t: (key, fallback) => {
        if (catalogue && Object.prototype.hasOwnProperty.call(catalogue, key)) {
          const value = catalogue[key];
          if (typeof value === 'string') return value;
        }
        return fallback ?? key;
      },
    };
  }, [catalogue]);
}

/** Synchronous helper for non-React contexts (e.g. service-layer error messages). */
export function getActiveLocale(): LocaleId {
  if (typeof document !== 'undefined') {
    const fromCookie = readLocaleFromCookie(document.cookie);
    if (fromCookie) return fromCookie;
    const fromNav = readLocaleFromNavigator();
    if (fromNav) return fromNav;
  }
  return DEFAULT_LOCALE;
}