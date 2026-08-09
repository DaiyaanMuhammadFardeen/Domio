/**
 * Bengali (Bangla) digit substitution.
 *
 * Bengali uses its own digit glyphs ০–৯ for everyday numerals.
 * The mapping is a simple codepoint shift: ASCII 0x30–0x39 → Bengali 0x09E6–0x09EF.
 *
 * LTR script — no bidi reordering required.
 */

const BENGALI_ZERO = 0x09e6; // ০
const ASCII_ZERO = 0x30; // '0'

/**
 * Convert every ASCII digit in `input` to its Bengali counterpart.
 * Non-digit characters are left untouched.
 *
 * @example
 * ```ts
 * toBengaliDigits('1250') // '১২৫০'
 * toBengaliDigits('৳1,250') // '৳১,২৫০'
 * ```
 */
export function toBengaliDigits(input: string): string {
  let result = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= ASCII_ZERO && code <= ASCII_ZERO + 9) {
      result += String.fromCodePoint(BENGALI_ZERO + (code - ASCII_ZERO));
    } else {
      result += ch;
    }
  }
  return result;
}
