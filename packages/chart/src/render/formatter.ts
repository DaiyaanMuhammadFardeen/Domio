/**
 * Locale-aware cell formatters using Intl built-ins.
 *
 * Currency, percent, dates, booleans — all via built-in APIs, no deps.
 */

/** Format a number using Intl.NumberFormat. */
export function formatNumber(
  value: unknown,
  opts: { locale?: string; decimals?: number } = {},
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const locale = opts.locale ?? 'en';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
}

/** Format as currency (USD by default). */
export function formatCurrency(
  value: unknown,
  opts: { locale?: string; currency?: string } = {},
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const locale = opts.locale ?? 'en';
  const currency = opts.currency ?? 'USD';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/** Format as percent. */
export function formatPercent(
  value: unknown,
  opts: { locale?: string; decimals?: number } = {},
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const locale = opts.locale ?? 'en';
  // Value is 0-100 scale, Intl expects 0-1
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 1,
  }).format(value / 100);
}

/** Format a date. */
export function formatDate(
  value: unknown,
  opts: { locale?: string; dateStyle?: 'short' | 'medium' | 'long' | 'full' } = {},
): string {
  const locale = opts.locale ?? 'en';
  if (value instanceof Date) {
    return new Intl.DateTimeFormat(locale, { dateStyle: opts.dateStyle ?? 'medium' }).format(value);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(locale, { dateStyle: opts.dateStyle ?? 'medium' }).format(d);
    }
  }
  return String(value ?? '');
}

/** Format a boolean. */
export function formatBoolean(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}

/** Detect ColumnType from a value. */
export function detectColumnType(value: unknown): 'number' | 'string' | 'boolean' | 'date' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    return 'string';
  }
  return 'string';
}
