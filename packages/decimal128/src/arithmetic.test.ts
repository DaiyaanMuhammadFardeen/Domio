/**
 * Decimal-128 tests — arithmetic + rounding + format + IRR/NPV.
 * Phase 10 M4.2 — 30+ cases.
 */

import { describe, expect, it } from 'vitest';
import {
  add,
  sub,
  mul,
  div,
  round,
  compare,
  isZero,
  isInfinity,
  isNaN,
  formatCurrency,
  formatNumber,
  toString,
  OVERFLOW_MAX,
  type RoundingMode,
} from './index.js';

// ── add / sub / mul / div ───────────────────────────────────────────────

describe('decimal128 add', () => {
  it('adds two integers', () => {
    expect(add('2', '3').value).toBe('5');
  });
  it('adds two decimals', () => {
    expect(add('0.1', '0.2').value).toBe('0.3');
  });
  it('adds negative and positive', () => {
    expect(add('-5', '3').value).toBe('-2');
  });
  it('preserves sign for zero result', () => {
    expect(add('1', '-1').value).toBe('0');
  });
  it('returns Infinity when one operand is', () => {
    expect(add('Infinity', '1').value).toBe('Infinity');
  });
  it('returns NaN for Infinity + -Infinity', () => {
    expect(add('Infinity', '-Infinity').value).toBe('NaN');
  });
  it('clamps on overflow', () => {
    const r = add(OVERFLOW_MAX, '1');
    expect(r.was_overflow).toBe(true);
    expect(r.value).toBe(OVERFLOW_MAX);
  });
});

describe('decimal128 sub', () => {
  it('subtracts', () => {
    expect(sub('5', '3').value).toBe('2');
  });
  it('flips sign of result', () => {
    expect(sub('3', '5').value).toBe('-2');
  });
  it('returns 0 for self', () => {
    expect(sub('7', '7').value).toBe('0');
  });
});

describe('decimal128 mul', () => {
  it('multiplies', () => {
    expect(mul('2.5', '4').value).toBe('10');
  });
  it('signs multiply', () => {
    expect(mul('-2', '3').value).toBe('-6');
  });
  it('0 * Inf is NaN', () => {
    expect(mul('0', 'Infinity').value).toBe('NaN');
  });
  it('Inf * finite is Inf', () => {
    expect(mul('Infinity', '2').value).toBe('Infinity');
  });
});

describe('decimal128 div', () => {
  it('divides', () => {
    expect(div('10', '2').value).toBe('5');
  });
  it('divide by zero returns 0 with flag', () => {
    const r = div('5', '0');
    expect(r.value).toBe('0');
    expect(r.was_zero_division).toBe(true);
  });
  it('0 / 0 is NaN', () => {
    expect(div('0', '0').value).toBe('NaN');
  });
  it('Inf / finite is Inf', () => {
    expect(div('Infinity', '2').value).toBe('Infinity');
  });
  it('finite / Inf is 0', () => {
    expect(div('1', 'Infinity').value).toBe('0');
  });
});

// ── compare / predicates ───────────────────────────────────────────────

describe('decimal128 compare / predicates', () => {
  it('compare returns -1 / 0 / 1', () => {
    expect(compare('1', '2')).toBe(-1);
    expect(compare('2', '2')).toBe(0);
    expect(compare('3', '2')).toBe(1);
  });
  it('compare signs flip', () => {
    expect(compare('-1', '1')).toBe(-1);
    expect(compare('-2', '-1')).toBe(-1);
  });
  it('isZero / isInfinity / isNaN', () => {
    expect(isZero('0')).toBe(true);
    expect(isZero('0.0')).toBe(true);
    expect(isZero('0.000')).toBe(true);
    expect(isZero('1')).toBe(false);
    expect(isInfinity('Infinity')).toBe(true);
    expect(isInfinity('-Infinity')).toBe(true);
    expect(isNaN('NaN')).toBe(true);
  });
});

// ── round ───────────────────────────────────────────────────────────────

describe('decimal128 round', () => {
  it('bankers rounding 0.5 → even', () => {
    expect(round('0.5', 0).value).toBe('0');
    expect(round('1.5', 0).value).toBe('2');
    expect(round('2.5', 0).value).toBe('2');
    expect(round('3.5', 0).value).toBe('4');
  });
  it('half-up 0.5 always rounds away from zero', () => {
    const m: RoundingMode = 'half-up';
    expect(round('0.5', 0, m).value).toBe('1');
    expect(round('1.5', 0, m).value).toBe('2');
    expect(round('2.5', 0, m).value).toBe('3');
  });
  it('half-down 0.5 rounds toward zero', () => {
    const m: RoundingMode = 'half-down';
    expect(round('0.5', 0, m).value).toBe('0');
    expect(round('1.5', 0, m).value).toBe('1');
    expect(round('2.5', 0, m).value).toBe('2');
  });
  it('rounds to given scale', () => {
    expect(round('1.235', 2).value).toBe('1.24');
    expect(round('1.245', 2).value).toBe('1.24'); // bankers
  });
  it('rounds large values', () => {
    expect(round('1234567890.12345', 2).value).toBe('1234567890.12');
  });
});

// ── format ─────────────────────────────────────────────────────────────

describe('decimal128 format', () => {
  it('en-US currency', () => {
    expect(formatCurrency('1234.5', 'USD', 'en-US')).toBe('$1,234.50');
  });
  it('bn-BD currency', () => {
    expect(formatCurrency('1234.5', 'BDT', 'bn-BD')).toMatch(/৳|TK/);
  });
  it('de-DE currency', () => {
    expect(formatCurrency('1234.5', 'EUR', 'de-DE')).toMatch(/€|EUR/);
  });
  it('ja-JP currency', () => {
    expect(formatCurrency('1234.5', 'JPY', 'ja-JP')).toMatch(/￥|¥|JPY/);
  });
  it('formatNumber with grouping', () => {
    expect(formatNumber('1234567.89', { locale: 'en-US' })).toBe('1,234,567.89');
    expect(formatNumber('1234567.89', { locale: 'de-DE' })).toMatch(/1\.234\.567/);
  });
  it('formatNumber falls back to "NaN" / infinity symbols', () => {
    expect(formatNumber('NaN', { locale: 'en-US' })).toBe('NaN');
    expect(formatNumber('Infinity', { locale: 'en-US' })).toBe('∞');
  });
});

// ── toString ───────────────────────────────────────────────────────────

describe('decimal128 toString', () => {
  it('round-trips integers', () => {
    expect(toString(42)).toBe('42');
  });
  it('round-trips decimals', () => {
    expect(toString(1.5)).toBe('1.5');
  });
  it('round-trips scientific', () => {
    expect(toString('1.5e3')).toBe('1.5e3');
  });
  it('throws on invalid', () => {
    expect(() => toString('abc')).toThrow();
  });
});

// ── IRR/NPV via calculator engine (proxy through recompute) ────────────
//
// We test the IRR math through the recompute engine's builtin in the
// calculator package; here we just confirm the rounding and arithmetic
// support the precision needed for finance.
describe('decimal128 finance-precision', () => {
  it('NPV at 10% over [-1000, 300, 400, 500] preserves precision', () => {
    // The decimal result of 500/1.331 should land at 375.65...
    // (verified via Math round-trip rather than Number() of the full
    // mantissa, since JS number caps at ~17 digits).
    const d500 = div('500', '1.331').value;
    expect(d500.startsWith('375.65')).toBe(true);
    // 300/1.1 — pure repeating decimal — should still resolve.
    const d300 = div('300', '1.1').value;
    expect(d300.startsWith('272.72')).toBe(true);
    // 400/1.21
    const d400 = div('400', '1.21').value;
    expect(d400.startsWith('330.57')).toBe(true);
  });

  it('NPV via Math round-trips to ~-21', () => {
    // Sanity check: when we project the decimal results back through
    // a Math double, the answer lands near the analytic NPV.
    // NPV at 10% of [-1000, 300, 400, 500] = -21.04...
    const v300 = Number(div('300', '1.1').value);
    const v400 = Number(div('400', '1.21').value);
    const v500 = Number(div('500', '1.331').value);
    const npv = -1000 + v300 + v400 + v500;
    expect(npv).toBeGreaterThan(-25);
    expect(npv).toBeLessThan(-15);
  });
});
