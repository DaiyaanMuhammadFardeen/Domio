/**
 * Locale-aware formatting for decimal values.
 *
 * Phase 10 M4.2 — supports en-US, bn-BD, de-DE, ja-JP out of the box;
 * any Intl-supported locale falls through to Intl.NumberFormat.
 */

import { toString, type DecInput } from './arithmetic.js';

export type SupportedLocale = 'en-US' | 'bn-BD' | 'de-DE' | 'ja-JP';

export interface FormatOptions {
  readonly locale?: SupportedLocale | string;
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

/** Format a decimal value as a plain number string with grouping. */
export function formatNumber(value: DecInput, opts: FormatOptions = {}): string {
  const locale = opts.locale ?? 'en-US';
  const n = Number(toString(value));
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  try {
    return new Intl.NumberFormat(locale, {
      ...(opts.minimumFractionDigits !== undefined ? { minimumFractionDigits: opts.minimumFractionDigits } : {}),
      ...(opts.maximumFractionDigits !== undefined ? { maximumFractionDigits: opts.maximumFractionDigits } : {}),
    }).format(n);
  } catch {
    return String(n);
  }
}

/** Format as currency. */
export function formatCurrency(value: DecInput, currency = 'USD', locale: SupportedLocale | string = 'en-US'): string {
  const n = Number(toString(value));
  if (Number.isNaN(n)) return 'NaN';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}