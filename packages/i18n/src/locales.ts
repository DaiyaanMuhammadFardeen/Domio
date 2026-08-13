/**
 * Locale identifiers supported by the Domio marketplace.
 *
 * Bengali (`bn`) is first-class — currency rendering, pluralization,
 * and digit substitution are all handled explicitly. Arabic (`ar`)
 * and Urdu (`ur`) round out the RTL set; the frontend flips the
 * document direction when an RTL locale is active.
 */
export type LocaleId = 'en' | 'bn' | 'es' | 'fr' | 'de' | 'ja' | 'zh-CN' | 'ar' | 'ur';

/** Ordered list of all supported locales. */
export const SUPPORTED_LOCALES: readonly LocaleId[] = [
  'en',
  'bn',
  'es',
  'fr',
  'de',
  'ja',
  'zh-CN',
  'ar',
  'ur',
] as const;

/** Fallback locale used when no explicit preference is provided. */
export const DEFAULT_LOCALE: LocaleId = 'en';

/**
 * Type guard — returns `true` when `value` is a valid {@link LocaleId}.
 */
export function isLocaleId(value: string): value is LocaleId {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Locales whose script is written right-to-left.
 *
 * Used by the editor and dashboard root layout to set `<html dir>` and
 * by utility code that needs to mirror layout for RTL readers (e.g.
 * flipping the slide thumbnail rail in the editor).
 *
 * Source: Unicode UAX #9 — bidi class table. Bengali (`bn`) is LTR
 * even though it shares script ancestry with Assamese and uses
 * Eastern Arabic digits.
 */
export const RTL_LOCALES: ReadonlySet<LocaleId> = new Set<LocaleId>(['ar', 'ur']);

/** Returns `true` when `locale` is rendered right-to-left. */
export function isRtlLocale(locale: LocaleId): boolean {
  return RTL_LOCALES.has(locale);
}

/**
 * Maps a {@link LocaleId} to the BCP-47 `<html lang="…">` attribute.
 *
 * Currently this is a 1:1 identity, but it leaves room for future
 * region suffixes (e.g. `bn-BD` vs `bn-IN`).
 */
export function toHtmlLang(locale: LocaleId): string {
  return locale;
}

/** Returns the value to use for `<html dir="…">` — `rtl` or `ltr`. */
export function toHtmlDir(locale: LocaleId): 'ltr' | 'rtl' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
