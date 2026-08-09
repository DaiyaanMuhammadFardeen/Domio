/**
 * @domio/dlp-warn — Luhn check for credit-card validation.
 *
 * Used to reduce false positives in the credit-card regex. The regex itself
 * catches any 13–19 digit group (with optional spaces/dashes), but Luhn
 * filters out valid-prefix-but-invalid-check-digit numbers.
 */

/**
 * Returns true if the digits-only form of `value` passes the Luhn check.
 * Non-digit characters are stripped before validation.
 */
export function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}