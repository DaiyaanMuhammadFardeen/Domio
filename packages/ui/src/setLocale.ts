/**
 * setLocale — write the active locale to the `domio-locale` cookie
 * and apply it to `<html lang>` / `<html dir>` so the document reflects
 * the new locale immediately.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Usage from a client component (e.g. a locale switcher in the
 * landing or dashboard chrome):
 *
 *   import { setLocale } from '@domio/ui';
 *   setLocale('bn');
 *
 * The cookie is set with `path=/`, `SameSite=Lax`, and a one-year
 * expiry so the preference persists across sessions. Server layouts
 * read the same cookie via `readLocaleFromCookie` when rendering
 * `<html lang>` on the server.
 */

import { isLocaleId, toHtmlDir, toHtmlLang, type LocaleId } from '@domio/i18n';
import { LOCALE_COOKIE } from './useLocale.js';

export interface SetLocaleOptions {
  /**
   * Cookie expiry in days. Default: 365.
   * Set to a lower value for short-lived experiments.
   */
  readonly days?: number;
}

/**
 * Persist `locale` to the `domio-locale` cookie and update
 * `<html lang>` / `<html dir>` so the document reflects the change
 * synchronously. No-op if `locale` is not a supported {@link LocaleId}.
 */
export function setLocale(locale: LocaleId, opts: SetLocaleOptions = {}): void {
  if (!isLocaleId(locale)) return;
  if (typeof document === 'undefined') return;
  const days = opts.days ?? 365;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${LOCALE_COOKIE}=${locale}; expires=${expires}; path=/; SameSite=Lax`;
  const root = document.documentElement;
  if (root) {
    root.setAttribute('lang', toHtmlLang(locale));
    root.setAttribute('dir', toHtmlDir(locale));
  }
}