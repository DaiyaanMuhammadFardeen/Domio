/**
 * Drill-down interaction — filter dataset by a series/category.
 */

import type { Dataset, BindingSchema, DrillResult } from '../types.js';

/**
 * Drill into a dataset by filtering rows where a column matches a value.
 * Returns a narrowed dataset and updated binding.
 */
export function drill(
  dataset: Dataset,
  binding: BindingSchema,
  column: string,
  value: unknown,
): DrillResult {
  const filteredRows = dataset.rows.filter((r) => r[column] === value);

  return {
    dataset: {
      columns: dataset.columns,
      rows: filteredRows,
    },
    binding,
  };
}

/**
 * Drill down by multiple criteria (AND filter).
 */
export function drillMultiple(
  dataset: Dataset,
  binding: BindingSchema,
  criteria: Record<string, unknown>,
): DrillResult {
  const filteredRows = dataset.rows.filter((r) =>
    Object.entries(criteria).every(([col, val]) => r[col] === val),
  );

  return {
    dataset: {
      columns: dataset.columns,
      rows: filteredRows,
    },
    binding,
  };
}
