import { describe, it, expect } from 'vitest';
import type { Dataset, ColumnType } from '../types.js';
import { sortDataset } from '../tables/sort.js';
import { paginate, firstPage, nextPage } from '../tables/paginate.js';
import { formatCell } from '../tables/format-cell.js';
import { applyConditionalFormat } from '../tables/conditional-format.js';
import type { ConditionalFormatRule } from '../tables/conditional-format.js';
import { sparkline } from '../tables/sparkline.js';

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------
describe('sortDataset', () => {
  const ds: Dataset = {
    columns: [{ name: 'name', type: 'string' }, { name: 'val', type: 'number' }],
    rows: [
      { name: 'Charlie', val: 30 },
      { name: 'Alice', val: 10 },
      { name: 'Bob', val: 20 },
    ],
  };

  it('sorts ascending by string', () => {
    const sorted = sortDataset(ds, { column: 'name', direction: 'asc' });
    expect(sorted.rows.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('sorts descending by string', () => {
    const sorted = sortDataset(ds, { column: 'name', direction: 'desc' });
    expect(sorted.rows.map((r) => r.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts ascending by number', () => {
    const sorted = sortDataset(ds, { column: 'val', direction: 'asc' });
    expect(sorted.rows.map((r) => r.val)).toEqual([10, 20, 30]);
  });

  it('sorts descending by number', () => {
    const sorted = sortDataset(ds, { column: 'val', direction: 'desc' });
    expect(sorted.rows.map((r) => r.val)).toEqual([30, 20, 10]);
  });

  it('does not mutate original', () => {
    const original = [...ds.rows];
    sortDataset(ds, { column: 'name', direction: 'asc' });
    expect(ds.rows).toEqual(original);
  });
});

describe('sortDataset locale-aware', () => {
  it('handles German umlauts', () => {
    const deDs: Dataset = {
      columns: [{ name: 'name', type: 'string' }],
      rows: [{ name: 'Über' }, { name: 'Ampel' }, { name: 'Ärger' }],
    };
    const sorted = sortDataset(deDs, { column: 'name', direction: 'asc', locale: 'de' });
    expect(sorted.rows.map((r) => r.name)).toEqual(['Ampel', 'Ärger', 'Über']);
  });

  it('numeric mode sorts 10 after 2', () => {
    const numDs: Dataset = {
      columns: [{ name: 'label', type: 'string' }],
      rows: [{ label: 'Item 10' }, { label: 'Item 2' }, { label: 'Item 1' }],
    };
    const sorted = sortDataset(numDs, { column: 'label', direction: 'asc', numeric: true });
    expect(sorted.rows.map((r) => r.label)).toEqual(['Item 1', 'Item 2', 'Item 10']);
  });
});

// ---------------------------------------------------------------------------
// Paginate
// ---------------------------------------------------------------------------
describe('paginate', () => {
  function makeLargeDs(n: number): Dataset {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < n; i++) rows.push({ id: i });
    return { columns: [{ name: 'id', type: 'number' as ColumnType }], rows };
  }

  it('returns correct page', () => {
    const ds = makeLargeDs(100);
    const result = paginate(ds, { offset: 0, limit: 10 });
    expect(result.dataset.rows.length).toBe(10);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(100);
  });

  it('firstPage creates cursor at offset 0', () => {
    const cursor = firstPage(50);
    expect(cursor.offset).toBe(0);
    expect(cursor.limit).toBe(50);
  });

  it('nextPage returns next cursor', () => {
    const ds = makeLargeDs(100);
    const page1 = paginate(ds, firstPage(30));
    const cursor2 = nextPage(page1);
    expect(cursor2).not.toBeNull();
    expect(cursor2!.offset).toBe(30);
  });

  it('nextPage returns null at end', () => {
    const ds = makeLargeDs(10);
    const page1 = paginate(ds, firstPage(100));
    expect(nextPage(page1)).toBeNull();
  });

  it('pages through 12k rows', () => {
    const ds = makeLargeDs(12000);
    let cursor: ReturnType<typeof firstPage> | null = firstPage(1000);
    let totalReturned = 0;
    while (cursor) {
      const page = paginate(ds, cursor);
      totalReturned += page.dataset.rows.length;
      cursor = nextPage(page);
    }
    expect(totalReturned).toBe(12000);
  });
});

// ---------------------------------------------------------------------------
// formatCell
// ---------------------------------------------------------------------------
describe('formatCell', () => {
  it('formats currency', () => {
    const result = formatCell(1234.56, 'currency');
    expect(result).toContain('$');
    expect(result).toContain('1');
  });

  it('formats percent', () => {
    const result = formatCell(75, 'percent');
    expect(result).toContain('%');
  });

  it('formats date', () => {
    const result = formatCell(new Date('2024-06-15'), 'date');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats number', () => {
    const result = formatCell(1234567, 'number');
    expect(result).toContain(',');
  });

  it('formats boolean', () => {
    expect(formatCell(true, 'boolean')).toBe('Yes');
    expect(formatCell(false, 'boolean')).toBe('No');
  });

  it('formats string as-is', () => {
    expect(formatCell('hello', 'string')).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Conditional format
// ---------------------------------------------------------------------------
describe('conditional format', () => {
  const rules: ConditionalFormatRule[] = [
    { column: 'score', operator: 'lt', threshold: 50, style: { backgroundColor: '#ff0000' } },
    { column: 'score', operator: 'gte', threshold: 90, style: { backgroundColor: '#00ff00', fontWeight: 700 } },
    { column: 'name', operator: 'contains', value: 'test', style: { color: 'red' } },
  ];

  it('first-match-wins', () => {
    const style = applyConditionalFormat(30, 'score', rules);
    expect(style).toEqual({ backgroundColor: '#ff0000' });
  });

  it('higher rule matches', () => {
    const style = applyConditionalFormat(95, 'score', rules);
    expect(style).toEqual({ backgroundColor: '#00ff00', fontWeight: 700 });
  });

  it('no match returns undefined', () => {
    const style = applyConditionalFormat(70, 'score', rules);
    expect(style).toBeUndefined();
  });

  it('between operator', () => {
    const betweenRules: ConditionalFormatRule[] = [
      { column: 'v', operator: 'between', threshold: 10, threshold2: 20, style: { color: 'blue' } },
    ];
    expect(applyConditionalFormat(15, 'v', betweenRules)).toEqual({ color: 'blue' });
    expect(applyConditionalFormat(5, 'v', betweenRules)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------
describe('sparkline', () => {
  it('emits polyline elements', () => {
    const elements = sparkline([10, 20, 15, 30, 25], 'spark_1');
    expect(elements.length).toBeGreaterThanOrEqual(2);
    expect(elements.some((e) => e.kind === 'polyline')).toBe(true);
  });

  it('handles empty data', () => {
    const elements = sparkline([], 'spark_empty');
    expect(elements.length).toBe(0);
  });

  it('single value renders without error', () => {
    const elements = sparkline([42], 'spark_single');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('shows dots when requested', () => {
    const elements = sparkline([1, 2, 3], 'spark_dots', { showDots: true });
    expect(elements.some((e) => e.semanticId.includes('dot'))).toBe(true);
  });
});
