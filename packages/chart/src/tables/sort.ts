/**
 * Locale-aware table sorting.
 *
 * Uses Intl.Collator for string sorting with numeric mode support.
 */

import type { Dataset } from '../types.js';

export interface SortOptions {
  column: string;
  direction: 'asc' | 'desc';
  locale?: string;
  numeric?: boolean;
}

/**
 * Sort a dataset by a column using locale-aware comparison.
 * Returns a new dataset (does not mutate the original).
 */
export function sortDataset(dataset: Dataset, opts: SortOptions): Dataset {
  const { column, direction, locale = 'en', numeric = true } = opts;
  const collator = new Intl.Collator(locale, { numeric, sensitivity: 'base' });
  const dir = direction === 'asc' ? 1 : -1;

  const sortedRows = [...dataset.rows].sort((a, b) => {
    const av = a[column];
    const bv = b[column];

    // Handle undefined/null
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    // Numeric comparison for numbers
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * dir;
    }

    // Date comparison
    if (av instanceof Date && bv instanceof Date) {
      return (av.getTime() - bv.getTime()) * dir;
    }

    // String comparison via Intl.Collator
    return collator.compare(String(av), String(bv)) * dir;
  });

  return { columns: dataset.columns, rows: sortedRows };
}
