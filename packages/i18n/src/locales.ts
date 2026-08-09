/**
 * Locale identifiers supported by the Domio marketplace.
 *
 * Bengali (`bn`) is first-class — currency rendering, pluralization,
 * and digit substitution are all handled explicitly.
 */
export type LocaleId = 'en' | 'bn' | 'es' | 'fr' | 'de' | 'ja' | 'zh-CN';

/** Ordered list of all supported locales. */
export const SUPPORTED_LOCALES: readonly LocaleId[] = [
  'en',
  'bn',
  'es',
  'fr',
  'de',
  'ja',
  'zh-CN',
] as const;

/** Fallback locale used when no explicit preference is provided. */
export const DEFAULT_LOCALE: LocaleId = 'en';

/**
 * Type guard — returns `true` when `value` is a valid {@link LocaleId}.
 */
export function isLocaleId(value: string): value is LocaleId {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
