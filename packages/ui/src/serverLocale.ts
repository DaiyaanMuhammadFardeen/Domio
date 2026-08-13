/**
 * resolveLocaleFromHeaders — server-side helper for Next.js layouts
 * and middleware. Reads the `domio-locale` cookie from the
 * `Cookie` header (or falls back to the first matching
 * `Accept-Language` value) and returns the resolved {@link LocaleId}.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * This is the SSR counterpart to `useLocale` / `getActiveLocale` so
 * the server can render `<html lang>` and `<html dir>` correctly on
 * first paint.
 */

import { DEFAULT_LOCALE, isLocaleId, toHtmlDir, toHtmlLang, type LocaleId } from '@domio/i18n';

export interface ResolveLocaleHeaders {
  readonly cookie?: string | null | undefined;
  readonly acceptLanguage?: string | null | undefined;
}

export interface ResolvedLocale {
  readonly locale: LocaleId;
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
}

const LOCALE_COOKIE = 'domio-locale';

/**
 * Resolve the locale from a request's cookie + accept-language
 * headers. The cookie takes precedence; accept-language is a
 * best-effort fallback.
 */
export function resolveLocaleFromHeaders(headers: ResolveLocaleHeaders): ResolvedLocale {
  const cookieHeader = headers.cookie ?? null;
  let resolved: LocaleId | null = null;
  if (cookieHeader) {
    for (const part of cookieHeader.split(/;\s*/)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k === LOCALE_COOKIE && isLocaleId(v)) {
        resolved = v;
        break;
      }
    }
  }
  if (!resolved) {
    const acceptLanguage = headers.acceptLanguage ?? null;
    if (acceptLanguage) {
      // Parse Accept-Language: best-fit is overkill; use the first
      // tag's primary subtag.
      const first = acceptLanguage.split(',')[0];
      if (first) {
        const lower = first.trim().toLowerCase();
        if (isLocaleId(lower)) resolved = lower;
        else {
          const base = lower.split('-')[0];
          if (base && isLocaleId(base)) resolved = base;
        }
      }
    }
  }
  const locale = resolved ?? DEFAULT_LOCALE;
  return {
    locale,
    lang: toHtmlLang(locale),
    dir: toHtmlDir(locale),
  };
}
