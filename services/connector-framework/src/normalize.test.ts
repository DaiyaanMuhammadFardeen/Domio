/**
 * Canonical normalization tests (Phase 08).
 */

import { describe, it, expect } from 'vitest';
import { normalize, isNormalized } from './normalize.js';
import type { ColumnType, SemanticRole } from './types.js';

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

describe('normalize — column type mapping', () => {
  it('infers string type', () => {
    const result = normalize(['col'], [['hello'], ['world']]);
    expect(result.columns[0]!.type).toBe('string');
    expect(result.columns[0]!.semantic_role).toBe('dimension');
  });

  it('infers number type', () => {
    const result = normalize(['col'], [[1], [2], [3]]);
    expect(result.columns[0]!.type).toBe('number');
    expect(result.columns[0]!.semantic_role).toBe('measure');
  });

  it('infers boolean type from boolean values', () => {
    const result = normalize(['col'], [[true], [false], [true]]);
    expect(result.columns[0]!.type).toBe('boolean');
  });

  it('infers boolean type from string booleans', () => {
    const result = normalize(['col'], [['true'], ['false'], ['true'], ['false'], ['true'], ['false']]);
    expect(result.columns[0]!.type).toBe('boolean');
  });

  it('infers date type from ISO date strings', () => {
    const result = normalize(['col'], [
      ['2024-01-15T10:30:00'],
      ['2024-02-20T14:00:00'],
      ['2024-03-10T08:15:00'],
      ['2024-04-05T12:45:00'],
      ['2024-05-01T09:00:00'],
    ]);
    expect(result.columns[0]!.type).toBe('date');
    expect(result.columns[0]!.semantic_role).toBe('date');
  });

  it('infers currency type from dollar amounts', () => {
    const result = normalize(['col'], [
      ['$1,200'],
      ['$3,400'],
      ['$5,600'],
      ['$7,800'],
      ['$9,000'],
      ['$11,200'],
    ]);
    expect(result.columns[0]!.type).toBe('currency');
    expect(result.columns[0]!.semantic_role).toBe('currency');
  });

  it('infers percent type from percentages', () => {
    const result = normalize(['col'], [
      ['75%'],
      ['80%'],
      ['90%'],
      ['95%'],
      ['60%'],
    ]);
    expect(result.columns[0]!.type).toBe('percent');
    expect(result.columns[0]!.semantic_role).toBe('percent');
  });
});

// ---------------------------------------------------------------------------
// Semantic role inference
// ---------------------------------------------------------------------------

describe('normalize — semantic_role inference', () => {
  it('maps price/amount/revenue to currency role', () => {
    const result = normalize(
      ['revenue'],
      [['$100'], ['$200'], ['$300'], ['$400'], ['$500'], ['$600']],
    );
    expect(result.columns[0]!.semantic_role).toBe('currency');
  });

  it('maps rate/ratio to percent role', () => {
    const result = normalize(
      ['conversion_rate'],
      [['50%'], ['60%'], ['70%'], ['80%'], ['90%'], ['100%']],
    );
    expect(result.columns[0]!.semantic_role).toBe('percent');
  });

  it('maps date/time/_at/_ts to date role', () => {
    const result = normalize(
      ['created_at'],
      [['2024-01-01T00:00'], ['2024-02-01T00:00'], ['2024-03-01T00:00'], ['2024-04-01T00:00'], ['2024-05-01T00:00']],
    );
    expect(result.columns[0]!.semantic_role).toBe('date');
  });

  it('maps id / _id to id role', () => {
    const result = normalize(
      ['user_id'],
      [[1], [2], [3]],
    );
    expect(result.columns[0]!.semantic_role).toBe('id');
  });

  it('maps bare "id" to id role', () => {
    const result = normalize(
      ['id'],
      [[1], [2], [3]],
    );
    expect(result.columns[0]!.semantic_role).toBe('id');
  });

  it('numeric column without special name gets measure role', () => {
    const result = normalize(
      ['count'],
      [[10], [20], [30]],
    );
    expect(result.columns[0]!.semantic_role).toBe('measure');
  });

  it('string column without special name gets dimension role', () => {
    const result = normalize(
      ['label'],
      [['a'], ['b'], ['c']],
    );
    expect(result.columns[0]!.semantic_role).toBe('dimension');
  });
});

// ---------------------------------------------------------------------------
// Round-trip property: 200 random adapter schemas
// ---------------------------------------------------------------------------

describe('normalize — property round-trip (200 random schemas)', () => {
  it('column count preserved, no missing values, types from canonical set', () => {
    const canonicalTypes: ColumnType[] = ['string', 'number', 'boolean', 'date', 'currency', 'percent'];
    const canonicalRoles: SemanticRole[] = ['dimension', 'measure', 'date', 'currency', 'percent', 'id'];

    for (let i = 0; i < 200; i++) {
      const numCols = 1 + Math.floor(Math.random() * 6);
      const numRows = 1 + Math.floor(Math.random() * 10);
      const colNames: string[] = [];
      const rows: unknown[][] = [];

      for (let c = 0; c < numCols; c++) {
        colNames.push(`col_${c}`);
      }
      for (let r = 0; r < numRows; r++) {
        const row: unknown[] = [];
        for (let c = 0; c < numCols; c++) {
          const kind = Math.floor(Math.random() * 4);
          if (kind === 0) row.push(Math.floor(Math.random() * 100));
          else if (kind === 1) row.push(`value_${Math.floor(Math.random() * 100)}`);
          else if (kind === 2) row.push(Math.random() > 0.5);
          else row.push(null);
        }
        rows.push(row);
      }

      const result = normalize(colNames, rows);

      // Column count preserved
      expect(result.columns.length).toBe(numCols);

      // Row count preserved
      expect(result.rows.length).toBe(numRows);

      // Types from canonical set
      for (const col of result.columns) {
        expect(canonicalTypes).toContain(col.type);
        expect(canonicalRoles).toContain(col.semantic_role);
      }

      // No missing values introduced (rows match original)
      for (let r = 0; r < numRows; r++) {
        expect(result.rows[r]!.length).toBe(numCols);
      }

      // Idempotency
      expect(isNormalized(result)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Hints override
// ---------------------------------------------------------------------------

describe('normalize — hints override', () => {
  it('type hint overrides inferred type', () => {
    const result = normalize(
      ['col'],
      [['42'], ['84'], ['126']],
      [{ name: 'col', type: 'string' }],
    );
    expect(result.columns[0]!.type).toBe('string');
  });

  it('semantic_role hint overrides inferred role', () => {
    const result = normalize(
      ['col'],
      [[100], [200], [300]],
      [{ name: 'col', semantic_role: 'dimension' }],
    );
    expect(result.columns[0]!.semantic_role).toBe('dimension');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('normalize — edge cases', () => {
  it('empty rows returns empty canonical with column definitions', () => {
    const result = normalize(['a', 'b', 'c'], []);
    expect(result.columns).toHaveLength(3);
    expect(result.rows).toHaveLength(0);
  });

  it('single row with nulls does not crash', () => {
    const result = normalize(['a', 'b'], [[null, null]]);
    expect(result.columns).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
  });

  it('mixed types default to string', () => {
    const result = normalize(['col'], [
      [1, 'hello', true, null],
      ['world', 42, false, 'data'],
    ]);
    expect(result.columns[0]!.type).toBe('string');
  });
});
