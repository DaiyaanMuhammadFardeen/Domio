/**
 * Connector framework — canonical normalization (Phase 08).
 *
 * Transforms raw rows + source-column metadata into canonical form:
 * - Type inference from sample values
 * - Semantic role heuristics
 * - PII detection on first ~50 rows
 * - Round-trip property: normalize(normalize(rows)) === normalize(rows)
 */

import type { CanonicalColumn, CanonicalRows, ColumnType, SemanticRole } from './types.js';
import { detectPiiColumns } from './pii.js';

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/,
  /^\d{2}\/\d{2}\/\d{4}/,
  /^\d{4}\/\d{2}\/\d{2}/,
];

const CURRENCY_PATTERN = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/;
const PERCENT_PATTERN = /^\d+(\.\d+)?%$/;

function inferColumnType(values: unknown[]): ColumnType {
  let numberCount = 0;
  let booleanCount = 0;
  let dateCount = 0;
  let currencyCount = 0;
  let percentCount = 0;
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');

  for (const v of nonNull) {
    if (typeof v === 'boolean') {
      booleanCount++;
    } else if (typeof v === 'number') {
      numberCount++;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (CURRENCY_PATTERN.test(trimmed)) currencyCount++;
      else if (PERCENT_PATTERN.test(trimmed)) percentCount++;
      else if (DATE_PATTERNS.some((p) => p.test(trimmed))) dateCount++;
      else if (trimmed === 'true' || trimmed === 'false') booleanCount++;
      else if (!isNaN(Number(trimmed)) && trimmed !== '') numberCount++;
    }
  }

  const total = nonNull.length || 1;
  if (currencyCount / total > 0.6) return 'currency';
  if (percentCount / total > 0.6) return 'percent';
  if (dateCount / total > 0.6) return 'date';
  if (booleanCount / total > 0.6) return 'boolean';
  if (numberCount / total > 0.6) return 'number';
  return 'string';
}

// ---------------------------------------------------------------------------
// Semantic role heuristics
// ---------------------------------------------------------------------------

function inferSemanticRole(colName: string, type: ColumnType): SemanticRole {
  const lower = colName.toLowerCase();
  if (type === 'currency' || lower.includes('price') || lower.includes('amount') || lower.includes('revenue') || lower.includes('cost') || lower.includes('salary')) return 'currency';
  if (type === 'percent' || lower.includes('rate') || lower.includes('ratio') || lower.includes('pct') || lower.includes('percentage')) return 'percent';
  if (type === 'date' || lower.includes('date') || lower.includes('time') || lower.includes('_at') || lower.includes('_ts')) return 'date';
  if (lower.includes('id') && (lower.endsWith('_id') || lower === 'id')) return 'id';
  if (type === 'number') return 'measure';
  return 'dimension';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ColumnHint {
  readonly name: string;
  readonly type?: ColumnType;
  readonly semantic_role?: SemanticRole;
}

/**
 * Normalize raw rows into canonical form.
 *
 * @param columnNames - Column names from the source
 * @param rawRows - Raw row data (arrays of values)
 * @param hints - Optional column metadata hints from the source
 * @param maxSampleRows - Max rows to scan for type inference and PII detection (default 50)
 */
export function normalize(
  columnNames: string[],
  rawRows: ReadonlyArray<ReadonlyArray<unknown>>,
  hints?: ColumnHint[],
  maxSampleRows = 50,
): CanonicalRows {
  const sampleRows = rawRows.slice(0, maxSampleRows);
  const hintMap = new Map<string, ColumnHint>();
  for (const h of hints ?? []) hintMap.set(h.name, h);

  // Transpose sample data for column-wise analysis
  const columns: CanonicalColumn[] = columnNames.map((name, idx) => {
    const hint = hintMap.get(name);
    const colValues = sampleRows.map((row) => row[idx]);
    const type = hint?.type ?? inferColumnType(colValues);
    const semantic_role = hint?.semantic_role ?? inferSemanticRole(name, type);
    return { name, type, semantic_role };
  });

  // PII detection
  const piiMap = detectPiiColumns(columns, sampleRows);
  const columnsWithPii: CanonicalColumn[] = columns.map((col) => {
    const level = piiMap.get(col.name);
    if (level && level !== 'none') {
      return { ...col, pii_detected: level };
    }
    return col;
  });

  return { columns: columnsWithPii, rows: rawRows };
}

/**
 * Verify normalization idempotency: normalize(normalize(...)) === normalize(...)
 */
export function isNormalized(result: CanonicalRows): boolean {
  const secondPass = normalize(
    result.columns.map((c) => c.name),
    result.rows,
    result.columns.map((c) => ({ name: c.name, type: c.type, semantic_role: c.semantic_role })),
  );
  return JSON.stringify(result) === JSON.stringify(secondPass);
}
