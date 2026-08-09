/**
 * Locale-aware pluralization rules.
 *
 * Each rule takes an integer count and returns a category key that callers
 * can use to select the correct translated string.
 *
 * Supported categories per locale:
 *  - `en`, `es`, `de`, `fr`: `one` | `other`  (standard CLDR)
 *  - `bn`:                  `one` | `other`  (Bengali: singular / plural)
 *  - `ar`:                  `zero` | `one` | `two` | `few` | `many` | `other`  (full CLDR)
 *  - `ur`:                  `one` | `other`  (Urdu: singular / plural)
 *  - `ja`, `zh-CN`:         `other`           (no grammatical plural)
 */

import type { LocaleId } from './locales.js';

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Return the CLDR plural category for `count` in the given `locale`.
 *
 * @example
 * ```ts
 * getPluralCategory('en', 1)  // 'one'
 * getPluralCategory('en', 2)  // 'other'
 * getPluralCategory('bn', 1)  // 'one'
 * getPluralCategory('bn', 5)  // 'other'
 * getPluralCategory('ja', 99) // 'other'
 * ```
 */
export function getPluralCategory(
  locale: LocaleId,
  count: number,
): PluralCategory {
  // Integer-ize to avoid floating-point edge cases.
  const n = Math.abs(Math.trunc(count));

  switch (locale) {
    // Bengali — singular when n == 1, otherwise plural.
    case 'bn':
      return n === 1 ? 'one' : 'other';

    // English, Spanish, German, French — singular when n == 1, otherwise plural.
    case 'en':
    case 'es':
    case 'de':
    case 'fr':
      return n === 1 ? 'one' : 'other';

    // Arabic — full CLDR six-form plural.
    case 'ar':
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (n % 100 >= 3 && n % 100 <= 10) return 'few';
      if (n % 100 >= 11 && n % 100 <= 99) return 'many';
      return 'other';

    // Urdu — singular when n == 1, otherwise plural.
    case 'ur':
      return n === 1 ? 'one' : 'other';

    // Japanese and Chinese have no grammatical plural distinction.
    case 'ja':
    case 'zh-CN':
      return 'other';
  }
}
