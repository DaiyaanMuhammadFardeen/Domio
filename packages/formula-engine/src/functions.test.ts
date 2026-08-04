/**
 * Tests for built-in formula functions.
 */

import { describe, it, expect } from 'vitest';
import { FUNCTIONS, type EvalContext } from './functions.js';
import { FormulaError, type FormulaErrorCode } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ctx: EvalContext = { fields: {}, version: 0 };

function callFn(name: string, args: Any[], overrides?: Partial<EvalContext>): Any {
  const fn = (FUNCTIONS as Record<string, (...a: Any[]) => Any>)[name];
  if (!fn) throw new Error(`Unknown function: ${name}`);
  return fn(args, { ...ctx, ...overrides });
}

/** Assert that a function call throws a FormulaError with a specific code. */
function expectError(fn: () => void, code: FormulaErrorCode): void {
  try {
    fn();
    expect.fail(`Expected ${code} but no error was thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaError);
    expect((e as FormulaError).code).toBe(code);
  }
}

// ── SUM ────────────────────────────────────────────────────

describe('SUM', () => {
  it('sums a flat list of numbers', () => {
    expect(callFn('SUM', [1, 2, 3])).toBe(6);
  });

  it('sums zero numbers', () => {
    expect(callFn('SUM', [])).toBe(0);
  });

  it('sums with nulls treated as 0', () => {
    expect(callFn('SUM', [1, null, 3])).toBe(4);
  });

  it('sums a single value', () => {
    expect(callFn('SUM', [42])).toBe(42);
  });

  it('sums negative numbers', () => {
    expect(callFn('SUM', [-1, -2, -3])).toBe(-6);
  });

  it('sums mixed positive and negative', () => {
    expect(callFn('SUM', [10, -3, 5])).toBe(12);
  });

  it('sums decimal values (locale-free)', () => {
    expect(callFn('SUM', [0.1, 0.2])).toBeCloseTo(0.3, 10);
  });

  it('coerces string numbers', () => {
    expect(callFn('SUM', ['3', 4])).toBe(7);
  });

  it('coerces booleans', () => {
    expect(callFn('SUM', [true, false, true])).toBe(2);
  });

  it('flattens array arguments', () => {
    expect(callFn('SUM', [[1, 2, 3], 4])).toBe(10);
  });

  it('sums with all nulls', () => {
    expect(callFn('SUM', [null, null])).toBe(0);
  });
});

// ── AVERAGE ────────────────────────────────────────────────

describe('AVERAGE', () => {
  it('averages a list of numbers', () => {
    expect(callFn('AVERAGE', [2, 4, 6])).toBe(4);
  });

  it('throws #DIV/0! for empty args', () => {
    expectError(() => callFn('AVERAGE', []), '#DIV/0!');
  });

  it('averages with nulls treated as 0', () => {
    expect(callFn('AVERAGE', [10, null, 20])).toBe(10);
  });

  it('averages a single value', () => {
    expect(callFn('AVERAGE', [7])).toBe(7);
  });

  it('averages negative numbers', () => {
    expect(callFn('AVERAGE', [-4, -6])).toBe(-5);
  });

  it('averages decimal values', () => {
    expect(callFn('AVERAGE', [1.5, 2.5])).toBe(2);
  });

  it('averages mixed types', () => {
    expect(callFn('AVERAGE', [true, 4])).toBe(2.5);
  });

  it('flattens array arguments', () => {
    expect(callFn('AVERAGE', [[2, 4], 6])).toBe(4);
  });
});

// ── COUNT ──────────────────────────────────────────────────

describe('COUNT', () => {
  it('counts numbers in a list', () => {
    expect(callFn('COUNT', [1, 2, 3])).toBe(3);
  });

  it('counts zero numbers', () => {
    expect(callFn('COUNT', [])).toBe(0);
  });

  it('ignores strings', () => {
    expect(callFn('COUNT', ['a', 'b'])).toBe(0);
  });

  it('ignores booleans', () => {
    expect(callFn('COUNT', [true, false])).toBe(0);
  });

  it('ignores nulls', () => {
    expect(callFn('COUNT', [null, null])).toBe(0);
  });

  it('counts mixed types', () => {
    expect(callFn('COUNT', [1, 'a', null, 3, true])).toBe(2);
  });

  it('counts numbers in arrays', () => {
    expect(callFn('COUNT', [[1, 2], 3])).toBe(3);
  });

  it('counts a single number', () => {
    expect(callFn('COUNT', [5])).toBe(1);
  });
});

// ── IF ─────────────────────────────────────────────────────

describe('IF', () => {
  it('returns true branch when condition is truthy', () => {
    expect(callFn('IF', [true, 'yes', 'no'])).toBe('yes');
  });

  it('returns false branch when condition is falsy', () => {
    expect(callFn('IF', [false, 'yes', 'no'])).toBe('no');
  });

  it('returns null for false branch when not provided', () => {
    expect(callFn('IF', [false, 'yes'])).toBeNull();
  });

  it('treats 1 as truthy', () => {
    expect(callFn('IF', [1, 'yes', 'no'])).toBe('yes');
  });

  it('treats 0 as falsy', () => {
    expect(callFn('IF', [0, 'yes', 'no'])).toBe('no');
  });

  it('treats null as falsy', () => {
    expect(callFn('IF', [null, 'yes', 'no'])).toBe('no');
  });

  it('treats non-empty string as truthy', () => {
    expect(callFn('IF', ['text', 1, 0])).toBe(1);
  });

  it('treats empty string as falsy', () => {
    expect(callFn('IF', ['', 1, 0])).toBe(0);
  });

  it('throws #VALUE! with less than 2 args', () => {
    expectError(() => callFn('IF', [true]), '#VALUE!');
  });
});

// ── AND / OR / NOT ─────────────────────────────────────────

describe('AND', () => {
  it('returns true when all values are truthy', () => {
    expect(callFn('AND', [true, true, true])).toBe(true);
  });

  it('returns false when any value is falsy', () => {
    expect(callFn('AND', [true, false, true])).toBe(false);
  });

  it('returns false for empty args', () => {
    expect(callFn('AND', [])).toBe(false);
  });

  it('coerces numbers', () => {
    expect(callFn('AND', [1, 2, 3])).toBe(true);
    expect(callFn('AND', [1, 0, 3])).toBe(false);
  });
});

describe('OR', () => {
  it('returns true when any value is truthy', () => {
    expect(callFn('OR', [false, true, false])).toBe(true);
  });

  it('returns false when all values are falsy', () => {
    expect(callFn('OR', [false, false, false])).toBe(false);
  });

  it('returns false for empty args', () => {
    expect(callFn('OR', [])).toBe(false);
  });
});

describe('NOT', () => {
  it('negates true to false', () => {
    expect(callFn('NOT', [true])).toBe(false);
  });

  it('negates false to true', () => {
    expect(callFn('NOT', [false])).toBe(true);
  });

  it('negates null to true', () => {
    expect(callFn('NOT', [null])).toBe(true);
  });

  it('negates 0 to true', () => {
    expect(callFn('NOT', [0])).toBe(true);
  });

  it('negates 1 to false', () => {
    expect(callFn('NOT', [1])).toBe(false);
  });
});

// ── IFERROR ────────────────────────────────────────────────

describe('IFERROR', () => {
  it('returns the value when not null', () => {
    expect(callFn('IFERROR', [42, 'fallback'])).toBe(42);
  });

  it('returns fallback when value is null', () => {
    expect(callFn('IFERROR', [null, 'fallback'])).toBe('fallback');
  });

  it('returns null when value is null and no fallback', () => {
    expect(callFn('IFERROR', [null])).toBeNull();
  });

  it('returns empty string as valid value', () => {
    expect(callFn('IFERROR', ['', 'fallback'])).toBe('');
  });
});

// ── COUNTIF / COUNTIFS ─────────────────────────────────────

describe('COUNTIF', () => {
  it('counts exact matches', () => {
    expect(callFn('COUNTIF', [[1, 2, 3, 2], '2'])).toBe(2);
  });

  it('counts with greater-than criteria', () => {
    expect(callFn('COUNTIF', [[1, 2, 3, 4], '>2'])).toBe(2);
  });

  it('counts with less-than-or-equal criteria', () => {
    expect(callFn('COUNTIF', [[1, 2, 3, 4], '<=2'])).toBe(2);
  });

  it('counts string matches', () => {
    expect(callFn('COUNTIF', [['a', 'b', 'a'], 'a'])).toBe(2);
  });

  it('counts with not-equal criteria', () => {
    expect(callFn('COUNTIF', [['a', 'b', 'a'], '<>a'])).toBe(1);
  });

  it('returns 0 for no matches', () => {
    expect(callFn('COUNTIF', [[1, 2, 3], '10'])).toBe(0);
  });
});

describe('COUNTIFS', () => {
  it('counts with multiple criteria (all must match per row)', () => {
    // Range1 [1,2,3,4] >1 → indices 1,2,3
    // Range2 [4,3,2,1] <4 → indices 1,2,3
    // All 3 rows match both
    expect(callFn('COUNTIFS', [[1, 2, 3, 4], '>1', [4, 3, 2, 1], '<4'])).toBe(3);
  });

  it('throws #VALUE! with odd number of args', () => {
    expectError(() => callFn('COUNTIFS', [[1, 2], '>1', [1, 2]]), '#VALUE!');
  });
});

// ── SUMIF / SUMIFS ─────────────────────────────────────────

describe('SUMIF', () => {
  it('sums matching values', () => {
    expect(callFn('SUMIF', [[1, 2, 3, 4], '>2'])).toBe(7);
  });

  it('sums with separate sum range', () => {
    expect(callFn('SUMIF', [['a', 'b', 'a'], 'a', [10, 20, 30]])).toBe(40);
  });

  it('returns 0 for no matches', () => {
    expect(callFn('SUMIF', [[1, 2, 3], '>100'])).toBe(0);
  });

  it('sums with equal criteria', () => {
    expect(callFn('SUMIF', [[1, 2, 1, 2], '=2', [10, 20, 30, 40]])).toBe(60);
  });
});

describe('SUMIFS', () => {
  it('sums with multiple criteria', () => {
    // SumRange [10,20,30,40]
    // Range1 [1,2,3,4] >1 → indices 1,2,3
    // Range2 [4,3,2,1] <4 → indices 1,2,3
    // All 3 match: 20+30+40 = 90
    expect(callFn('SUMIFS', [[10, 20, 30, 40], [1, 2, 3, 4], '>1', [4, 3, 2, 1], '<4'])).toBe(90);
  });

  it('throws #VALUE! with wrong arg count', () => {
    expectError(() => callFn('SUMIFS', [[1, 2], '>1']), '#VALUE!');
  });
});

// ── AVERAGEIF / AVERAGEIFS ─────────────────────────────────

describe('AVERAGEIF', () => {
  it('averages matching values', () => {
    expect(callFn('AVERAGEIF', [[1, 2, 3, 4], '>2'])).toBe(3.5);
  });

  it('throws #DIV/0! when no matches', () => {
    expectError(() => callFn('AVERAGEIF', [[1, 2], '>100']), '#DIV/0!');
  });

  it('uses separate average range', () => {
    expect(callFn('AVERAGEIF', [['a', 'b', 'a'], 'a', [10, 20, 30]])).toBe(20);
  });
});

describe('AVERAGEIFS', () => {
  it('averages with multiple criteria', () => {
    // AvgRange [10,20,30,40]
    // Range1 [1,2,3,4] >1 → indices 1,2,3
    // Range2 [4,3,2,1] <4 → indices 1,2,3
    // All 3 match: avg(20,30,40) = 30
    expect(callFn('AVERAGEIFS', [[10, 20, 30, 40], [1, 2, 3, 4], '>1', [4, 3, 2, 1], '<4'])).toBe(30);
  });

  it('throws #DIV/0! when no matches', () => {
    expectError(() => callFn('AVERAGEIFS', [[1, 2], [1, 2], '>100']), '#DIV/0!');
  });
});

// ── ABS ────────────────────────────────────────────────────

describe('ABS', () => {
  it('returns absolute value of negative', () => {
    expect(callFn('ABS', [-5])).toBe(5);
  });

  it('returns absolute value of positive', () => {
    expect(callFn('ABS', [5])).toBe(5);
  });

  it('returns 0 for 0', () => {
    expect(callFn('ABS', [0])).toBe(0);
  });

  it('coerces string number', () => {
    expect(callFn('ABS', ['-3.5'])).toBe(3.5);
  });
});

// ── ROUND / ROUNDUP / ROUNDDOWN ────────────────────────────

describe('ROUND', () => {
  it('rounds to 0 decimals by default', () => {
    expect(callFn('ROUND', [2.5])).toBe(3);
  });

  it('rounds to specified decimals', () => {
    expect(callFn('ROUND', [2.35, 1])).toBe(2.4);
  });

  it('rounds to negative decimals', () => {
    expect(callFn('ROUND', [1234, -2])).toBe(1200);
  });
});

describe('ROUNDUP', () => {
  it('rounds up away from zero', () => {
    expect(callFn('ROUNDUP', [2.1])).toBe(3);
  });

  it('rounds up with decimals', () => {
    expect(callFn('ROUNDUP', [2.001, 2])).toBe(2.01);
  });
});

describe('ROUNDDOWN', () => {
  it('rounds down toward zero', () => {
    expect(callFn('ROUNDDOWN', [2.9])).toBe(2);
  });

  it('rounds down with decimals', () => {
    expect(callFn('ROUNDDOWN', [2.999, 2])).toBe(2.99);
  });
});

// ── INT ────────────────────────────────────────────────────

describe('INT', () => {
  it('floors positive number', () => {
    expect(callFn('INT', [3.7])).toBe(3);
  });

  it('floors negative number', () => {
    expect(callFn('INT', [-3.7])).toBe(-4);
  });

  it('floors integer', () => {
    expect(callFn('INT', [5])).toBe(5);
  });
});

// ── MOD ────────────────────────────────────────────────────

describe('MOD', () => {
  it('computes modulo', () => {
    expect(callFn('MOD', [10, 3])).toBe(1);
  });

  it('throws #DIV/0! for zero divisor', () => {
    expectError(() => callFn('MOD', [10, 0]), '#DIV/0!');
  });

  it('handles negative dividend', () => {
    expect(callFn('MOD', [-10, 3])).toBe(2);
  });
});

// ── POWER / SQRT ───────────────────────────────────────────

describe('POWER', () => {
  it('computes power', () => {
    expect(callFn('POWER', [2, 3])).toBe(8);
  });

  it('handles zero exponent', () => {
    expect(callFn('POWER', [5, 0])).toBe(1);
  });
});

describe('SQRT', () => {
  it('computes square root', () => {
    expect(callFn('SQRT', [9])).toBe(3);
  });

  it('throws #NUM! for negative', () => {
    expectError(() => callFn('SQRT', [-1]), '#NUM!');
  });
});

// ── MIN / MAX ──────────────────────────────────────────────

describe('MIN', () => {
  it('finds minimum', () => {
    expect(callFn('MIN', [3, 1, 2])).toBe(1);
  });

  it('returns 0 for empty', () => {
    expect(callFn('MIN', [])).toBe(0);
  });

  it('handles negatives', () => {
    expect(callFn('MIN', [-5, -1, -10])).toBe(-10);
  });
});

describe('MAX', () => {
  it('finds maximum', () => {
    expect(callFn('MAX', [3, 1, 2])).toBe(3);
  });

  it('returns 0 for empty', () => {
    expect(callFn('MAX', [])).toBe(0);
  });

  it('handles negatives', () => {
    expect(callFn('MAX', [-5, -1, -10])).toBe(-1);
  });
});

// ── RAND / RANDBETWEEN ─────────────────────────────────────

describe('RAND', () => {
  it('returns a number between 0 and 1', () => {
    const val = callFn('RAND', [], { seed: 42 });
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('is deterministic with same seed', () => {
    const a = callFn('RAND', [], { seed: 1 });
    const b = callFn('RAND', [], { seed: 1 });
    expect(a).toBe(b);
  });
});

describe('RANDBETWEEN', () => {
  it('returns integer in range', () => {
    const val = callFn('RANDBETWEEN', [1, 10], { seed: 42 });
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThanOrEqual(1);
    expect(val).toBeLessThanOrEqual(10);
    expect(Number.isInteger(val)).toBe(true);
  });

  it('is deterministic with same seed', () => {
    const a = callFn('RANDBETWEEN', [1, 100], { seed: 7 });
    const b = callFn('RANDBETWEEN', [1, 100], { seed: 7 });
    expect(a).toBe(b);
  });
});

// ── TEXT ───────────────────────────────────────────────────

describe('TEXT', () => {
  it('formats number as integer', () => {
    expect(callFn('TEXT', [42.5, '0'])).toBe('43');
  });

  it('formats number with 2 decimals', () => {
    expect(callFn('TEXT', [3.14159, '0.00'])).toBe('3.14');
  });

  it('returns empty string for null', () => {
    expect(callFn('TEXT', [null, '0'])).toBe('');
  });

  it('formats with percentage', () => {
    expect(callFn('TEXT', [0.5, '0%'])).toBe('50%');
  });
});

// ── CONCAT ─────────────────────────────────────────────────

describe('CONCAT', () => {
  it('concatenates strings', () => {
    expect(callFn('CONCAT', ['hello', ' ', 'world'])).toBe('hello world');
  });

  it('converts numbers to strings', () => {
    expect(callFn('CONCAT', [1, 2, 3])).toBe('123');
  });

  it('converts null to empty string', () => {
    expect(callFn('CONCAT', ['a', null, 'b'])).toBe('ab');
  });
});

// ── VLOOKUP ────────────────────────────────────────────────

describe('VLOOKUP', () => {
  it('finds exact match (range_lookup=false)', () => {
    const table = [['a', 1], ['b', 2], ['c', 3]];
    expect(callFn('VLOOKUP', ['b', table, 2, false])).toBe(2);
  });

  it('throws #N/A when not found', () => {
    const table = [['a', 1], ['b', 2]];
    expectError(() => callFn('VLOOKUP', ['z', table, 2, false]), '#N/A');
  });

  it('finds approximate match (range_lookup=true)', () => {
    const table = [[10, 'low'], [20, 'mid'], [30, 'high']];
    expect(callFn('VLOOKUP', [25, table, 2, true])).toBe('mid');
  });
});

// ── LOOKUP ─────────────────────────────────────────────────

describe('LOOKUP', () => {
  it('finds matching value', () => {
    expect(callFn('LOOKUP', ['b', ['a', 'b', 'c']])).toBe('b');
  });

  it('throws #N/A when not found', () => {
    expectError(() => callFn('LOOKUP', ['z', ['a', 'b', 'c']]), '#N/A');
  });
});

// ── Date / Time functions ──────────────────────────────────

describe('DATE', () => {
  it('creates a date', () => {
    const result = callFn('DATE', [2024, 6, 15]);
    expect(result).toBeInstanceOf(Date);
    expect((result as unknown as Date).getFullYear()).toBe(2024);
    expect((result as unknown as Date).getMonth()).toBe(5); // June = 5
    expect((result as unknown as Date).getDate()).toBe(15);
  });
});

describe('NOW', () => {
  it('returns current date', () => {
    const now = new Date('2024-01-15T12:00:00');
    const result = callFn('NOW', [], { now });
    expect(result).toBe(now);
  });
});

describe('TODAY', () => {
  it('returns date without time', () => {
    const now = new Date('2024-01-15T12:30:00');
    const result = callFn('TODAY', [], { now }) as unknown as Date;
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(0);
  });
});

describe('YEAR', () => {
  it('extracts year', () => {
    const date = new Date(2024, 5, 15);
    expect(callFn('YEAR', [date])).toBe(2024);
  });
});

describe('MONTH', () => {
  it('extracts month (1-based)', () => {
    const date = new Date(2024, 5, 15);
    expect(callFn('MONTH', [date])).toBe(6);
  });
});

describe('DAY', () => {
  it('extracts day', () => {
    const date = new Date(2024, 5, 15);
    expect(callFn('DAY', [date])).toBe(15);
  });
});

describe('HOUR', () => {
  it('extracts hour', () => {
    const date = new Date(2024, 0, 1, 14, 30, 0);
    expect(callFn('HOUR', [date])).toBe(14);
  });
});

describe('MINUTE', () => {
  it('extracts minute', () => {
    const date = new Date(2024, 0, 1, 14, 30, 0);
    expect(callFn('MINUTE', [date])).toBe(30);
  });
});

describe('SECOND', () => {
  it('extracts second', () => {
    const date = new Date(2024, 0, 1, 14, 30, 45);
    expect(callFn('SECOND', [date])).toBe(45);
  });
});

describe('EOMONTH', () => {
  it('returns end of month', () => {
    const date = new Date(2024, 0, 15);
    const result = callFn('EOMONTH', [date, 0]) as unknown as Date;
    expect(result.getDate()).toBe(31);
    expect(result.getMonth()).toBe(0);
  });

  it('returns end of next month', () => {
    const date = new Date(2024, 0, 15);
    const result = callFn('EOMONTH', [date, 1]) as unknown as Date;
    expect(result.getDate()).toBe(29); // Feb 2024 (leap year)
  });
});

describe('EDATE', () => {
  it('adds months', () => {
    const date = new Date(2024, 0, 15);
    const result = callFn('EDATE', [date, 3]) as unknown as Date;
    expect(result.getMonth()).toBe(3); // April
  });

  it('subtracts months', () => {
    const date = new Date(2024, 3, 15);
    const result = callFn('EDATE', [date, -1]) as unknown as Date;
    expect(result.getMonth()).toBe(2); // March
  });
});

describe('DATEDIF', () => {
  it('computes day difference', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 11);
    expect(callFn('DATEDIF', [start, end, 'D'])).toBe(10);
  });

  it('computes month difference (floor of days/30)', () => {
    // Jan 1 to Jul 1 = 182 days. Implementation: Math.floor(182/30) = 6
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 6, 1);
    expect(callFn('DATEDIF', [start, end, 'M'])).toBe(6);
  });

  it('throws #VALUE! for unknown unit', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 1, 1);
    expectError(() => callFn('DATEDIF', [start, end, 'X']), '#VALUE!');
  });
});

describe('NETWORKDAYS', () => {
  it('counts weekdays between dates', () => {
    // Mon Jan 1, 2024 to Fri Jan 5, 2024 = 5 weekdays
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 5);
    expect(callFn('NETWORKDAYS', [start, end])).toBe(5);
  });

  it('excludes weekends', () => {
    // Mon Jan 1 to Sun Jan 7 = 5 weekdays
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 7);
    expect(callFn('NETWORKDAYS', [start, end])).toBe(5);
  });
});

describe('WORKDAY', () => {
  it('adds workdays skipping weekends', () => {
    // Friday Jan 5, 2024 + 1 workday = Monday Jan 8
    const start = new Date(2024, 0, 5);
    const result = callFn('WORKDAY', [start, 1]) as unknown as Date;
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(8);
  });
});

// ── Type checks ────────────────────────────────────────────

describe('ISBLANK', () => {
  it('returns true for null', () => {
    expect(callFn('ISBLANK', [null])).toBe(true);
  });

  it('returns false for 0', () => {
    expect(callFn('ISBLANK', [0])).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(callFn('ISBLANK', [''])).toBe(false);
  });
});

describe('ISNUMBER', () => {
  it('returns true for number', () => {
    expect(callFn('ISNUMBER', [42])).toBe(true);
  });

  it('returns false for string', () => {
    expect(callFn('ISNUMBER', ['42'])).toBe(false);
  });

  it('returns false for null', () => {
    expect(callFn('ISNUMBER', [null])).toBe(false);
  });
});

describe('ISTEXT', () => {
  it('returns true for string', () => {
    expect(callFn('ISTEXT', ['hello'])).toBe(true);
  });

  it('returns false for number', () => {
    expect(callFn('ISTEXT', [42])).toBe(false);
  });

  it('returns false for null', () => {
    expect(callFn('ISTEXT', [null])).toBe(false);
  });
});

// ── Text functions ─────────────────────────────────────────

describe('LEN', () => {
  it('returns string length', () => {
    expect(callFn('LEN', ['hello'])).toBe(5);
  });

  it('returns 0 for empty string', () => {
    expect(callFn('LEN', [''])).toBe(0);
  });
});

describe('LEFT', () => {
  it('returns first character', () => {
    expect(callFn('LEFT', ['hello'])).toBe('h');
  });

  it('returns n characters', () => {
    expect(callFn('LEFT', ['hello', 3])).toBe('hel');
  });
});

describe('RIGHT', () => {
  it('returns last character', () => {
    expect(callFn('RIGHT', ['hello'])).toBe('o');
  });

  it('returns n characters from right', () => {
    expect(callFn('RIGHT', ['hello', 3])).toBe('llo');
  });
});

describe('MID', () => {
  it('extracts substring', () => {
    expect(callFn('MID', ['hello', 2, 3])).toBe('ell');
  });
});

describe('TRIM', () => {
  it('removes leading/trailing spaces', () => {
    expect(callFn('TRIM', ['  hello  '])).toBe('hello');
  });
});

describe('UPPER', () => {
  it('converts to uppercase', () => {
    expect(callFn('UPPER', ['hello'])).toBe('HELLO');
  });
});

describe('LOWER', () => {
  it('converts to lowercase', () => {
    expect(callFn('LOWER', ['HELLO'])).toBe('hello');
  });
});

describe('PROPER', () => {
  it('capitalizes first letter of each word', () => {
    expect(callFn('PROPER', ['hello world'])).toBe('Hello World');
  });
});

describe('SUBSTITUTE', () => {
  it('replaces all occurrences', () => {
    // "hello world" with all l→r: "herro worrd"
    expect(callFn('SUBSTITUTE', ['hello world', 'l', 'r'])).toBe('herro worrd');
  });

  it('replaces specific instance (2nd occurrence)', () => {
    // "hello" with 2nd l→r: "helro"
    expect(callFn('SUBSTITUTE', ['hello', 'l', 'r', 2])).toBe('helro');
  });
});

describe('REPT', () => {
  it('repeats string', () => {
    expect(callFn('REPT', ['ab', 3])).toBe('ababab');
  });

  it('returns empty string for 0', () => {
    expect(callFn('REPT', ['ab', 0])).toBe('');
  });

  it('throws #VALUE! for negative', () => {
    expectError(() => callFn('REPT', ['ab', -1]), '#VALUE!');
  });
});

// ── Edge cases ─────────────────────────────────────────────

describe('division by zero in evaluate context', () => {
  it('DIV/0! via MOD', () => {
    expectError(() => callFn('MOD', [1, 0]), '#DIV/0!');
  });
});

describe('unknown function name', () => {
  it('returns undefined for unknown function', () => {
    expect(FUNCTIONS['NONEXISTENT']).toBeUndefined();
  });
});

describe('type coercion', () => {
  it('boolean true coerces to 1 in numeric context', () => {
    expect(callFn('SUM', [true, 1])).toBe(2);
  });

  it('boolean false coerces to 0 in numeric context', () => {
    expect(callFn('SUM', [false, 1])).toBe(1);
  });

  it('string number coerces in numeric context', () => {
    expect(callFn('SUM', ['5', 5])).toBe(10);
  });

  it('non-numeric string coerces to 0', () => {
    expect(callFn('SUM', ['abc', 1])).toBe(1);
  });
});
