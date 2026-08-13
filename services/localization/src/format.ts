/**
 * Locale-aware formatting via Intl.NumberFormat / Intl.DateTimeFormat.
 *
 * Provides:
 *   - formatNumber  — locale-aware number formatting
 *   - formatCurrency — locale-aware currency formatting
 *   - formatPercent  — locale-aware percent formatting
 *   - formatDate     — locale-aware date formatting
 *   - compareLocale  — locale-aware string collation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormatNumberOptions {
  readonly locale: string;
  readonly style?: 'decimal' | 'currency' | 'percent';
  readonly currency?: string;
  readonly decimals?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a number using locale-aware rules.
 */
export function formatNumber(value: number, opts: FormatNumberOptions): string {
  const formatter = new Intl.NumberFormat(opts.locale, {
    style: opts.style ?? 'decimal',
    ...(opts.currency && opts.style === 'currency' ? { currency: opts.currency } : {}),
    ...(opts.decimals !== undefined
      ? { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals }
      : {}),
  });
  return formatter.format(value);
}

/**
 * Format a number as currency.
 */
export function formatCurrency(
  value: number,
  opts: { locale: string; currency: string; decimals?: number },
): string {
  return formatNumber(value, { ...opts, style: 'currency' });
}

/**
 * Format a number as a percent.
 */
export function formatPercent(value: number, opts: { locale: string; decimals?: number }): string {
  return formatNumber(value, { ...opts, style: 'percent' });
}

/**
 * Format a date using locale-aware rules.
 */
export function formatDate(
  date: Date,
  opts: {
    locale: string;
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    timeStyle?: 'full' | 'long' | 'medium' | 'short';
  },
): string {
  const formatter = new Intl.DateTimeFormat(opts.locale, {
    dateStyle: opts.dateStyle ?? 'medium',
    ...(opts.timeStyle ? { timeStyle: opts.timeStyle } : {}),
  });
  return formatter.format(date);
}

/**
 * Locale-aware collation — compare two strings using the rules of the
 * given locale.  Returns a negative number, zero, or positive number.
 */
export function compareLocale(a: string, b: string, locale: string): number {
  const collator = new Intl.Collator(locale);
  return collator.compare(a, b);
}
