/**
 * Cell formatting using Intl built-ins.
 */

import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatBoolean,
  formatNumber,
} from '../render/formatter.js';
import type { ColumnType } from '../types.js';

/**
 * Format a cell value based on its column type and optional format string.
 */
export function formatCell(
  value: unknown,
  columnType: ColumnType,
  opts: { locale?: string; currency?: string; format?: string } = {},
): string {
  const locale = opts.locale ?? 'en';

  switch (columnType) {
    case 'currency': {
      const currencyOpts: { locale: string; currency?: string } = { locale };
      if (opts.currency !== undefined) currencyOpts.currency = opts.currency;
      return formatCurrency(value, currencyOpts);
    }
    case 'percent':
      return formatPercent(value, { locale });
    case 'date':
      return formatDate(value, { locale });
    case 'number':
      return formatNumber(value, { locale });
    case 'boolean':
      return formatBoolean(value);
    case 'string':
    default:
      return String(value ?? '');
  }
}
