/**
 * Binding schema validation.
 *
 * Ensures a dataset has the required columns with compatible types
 * for a given chart type.
 */

import type {
  ChartType,
  BindingSchema,
  BindingValidationError,
  Dataset,
  ColumnDef,
  ColumnType,
} from './types.js';

// ---------------------------------------------------------------------------
// Required binding columns per chart type
// ---------------------------------------------------------------------------

const REQUIRED_BINDINGS: Record<ChartType, Array<{ role: string; columnType: ColumnType }>> = {
  bar: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'number' },
  ],
  line: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'number' },
  ],
  area: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'number' },
  ],
  pie: [
    { role: 'label', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  scatter: [
    { role: 'x', columnType: 'number' },
    { role: 'y', columnType: 'number' },
  ],
  funnel: [
    { role: 'label', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  sankey: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  treemap: [
    { role: 'label', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  heatmap: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  waterfall: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'number' },
  ],
  gauge: [{ role: 'value', columnType: 'number' }],
  radar: [
    { role: 'label', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
  candlestick: [
    { role: 'x', columnType: 'string' },
    { role: 'y', columnType: 'number' },
  ],
  bullet: [
    { role: 'label', columnType: 'string' },
    { role: 'value', columnType: 'number' },
  ],
};

/**
 * Get the required binding columns for a chart type.
 */
export function requiredBindings(type: ChartType): Array<{ role: string; columnType: ColumnType }> {
  return REQUIRED_BINDINGS[type] ?? [];
}

/**
 * Validate that a dataset satisfies a binding schema.
 * Returns array of validation errors (empty = valid).
 */
export function validateBinding(schema: BindingSchema, dataset: Dataset): BindingValidationError[] {
  const errors: BindingValidationError[] = [];
  const colMap = new Map<string, ColumnDef>();
  for (const col of dataset.columns) {
    colMap.set(col.name, col);
  }

  for (const binding of schema.columns) {
    const col = colMap.get(binding.column);
    if (!col) {
      errors.push({
        kind: 'missing_column',
        role: binding.role,
        column: binding.column,
        message: `Column "${binding.column}" required for role "${binding.role}" not found in dataset`,
      });
      continue;
    }

    const required = REQUIRED_BINDINGS[schema.type];
    const requiredDef = required?.find((r) => r.role === binding.role);
    if (requiredDef && col.type !== requiredDef.columnType) {
      errors.push({
        kind: 'type_mismatch',
        role: binding.role,
        column: binding.column,
        expected: requiredDef.columnType,
        actual: col.type,
        message: `Column "${binding.column}" for role "${binding.role}" has type "${col.type}" but expected "${requiredDef.columnType}"`,
      });
    }
  }

  return errors;
}

/**
 * Check if a binding is compatible (no errors).
 */
export function bindingCompatible(schema: BindingSchema, dataset: Dataset): boolean {
  return validateBinding(schema, dataset).length === 0;
}
