/**
 * @domio/i18n — Internationalization utilities for the Domio marketplace.
 *
 * @packageDocumentation
 */

export { isLocaleId, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales.js';
export type { LocaleId } from './locales.js';

export { toBengaliDigits } from './bengali-digits.js';

export { getPluralCategory } from './pluralization.js';
export type { PluralCategory } from './pluralization.js';

export { formatCurrency } from './format-currency.js';
export type { CurrencyCode } from './format-currency.js';
