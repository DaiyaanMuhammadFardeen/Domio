/**
 * Brush zoom — filter x-range on chart data.
 */

import type { Dataset, BindingSchema, BrushRange } from '../types.js';

/**
 * Filter dataset rows to those within a brush range.
 * Supports both numeric and string (index-based) x-axis values.
 */
export function brushZoom(dataset: Dataset, binding: BindingSchema, range: BrushRange): Dataset {
  const xBinding = binding.columns.find((c) => c.role === 'x');
  if (!xBinding) return dataset;

  const filteredRows = dataset.rows.filter((_, i) => {
    return i >= range.start && i <= range.end;
  });

  return {
    columns: dataset.columns,
    rows: filteredRows,
  };
}

/**
 * Filter dataset by numeric x-range (values between min and max).
 */
export function brushZoomByValue(
  dataset: Dataset,
  _binding: BindingSchema,
  column: string,
  min: number,
  max: number,
): Dataset {
  const filteredRows = dataset.rows.filter((r) => {
    const v = Number(r[column]);
    return Number.isFinite(v) && v >= min && v <= max;
  });

  return {
    columns: dataset.columns,
    rows: filteredRows,
  };
}
