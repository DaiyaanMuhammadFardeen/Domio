/**
 * Cursor-based pagination for large datasets.
 */

import type { Dataset } from '../types.js';

export interface PageCursor {
  offset: number;
  limit: number;
}

export interface PageResult {
  dataset: Dataset;
  cursor: PageCursor;
  hasMore: boolean;
  total: number;
}

/**
 * Paginate a dataset using a cursor.
 * Cursor 1: { offset: 0, limit: 100 } → first page.
 * Next cursor: { offset: 100, limit: 100 }.
 */
export function paginate(dataset: Dataset, cursor: PageCursor): PageResult {
  const { offset, limit } = cursor;
  const total = dataset.rows.length;
  const start = Math.min(offset, total);
  const end = Math.min(start + limit, total);

  return {
    dataset: {
      columns: dataset.columns,
      rows: dataset.rows.slice(start, end),
    },
    cursor: { offset: start, limit },
    hasMore: end < total,
    total,
  };
}

/**
 * Create the first page cursor.
 */
export function firstPage(limit: number): PageCursor {
  return { offset: 0, limit };
}

/**
 * Create the next page cursor from a result.
 */
export function nextPage(result: PageResult): PageCursor | null {
  if (!result.hasMore) return null;
  return { offset: result.cursor.offset + result.cursor.limit, limit: result.cursor.limit };
}
