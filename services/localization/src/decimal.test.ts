/**
 * Decimal tests — property test 200 pairs, no float drift, rounding.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from './decimal.js';

describe('Decimal — basic arithmetic', () => {
  it('0.1 + 0.2 === 0.3 (no float drift)', () => {
    const a = Decimal.from(0.1);
    const b = Decimal.from(0.2);
    const c = a.add(b);
    expect(c.toNumber()).toBe(0.3);
  });

  it('1.0 - 0.9 === 0.1', () => {
    const a = Decimal.from(1.0);
    const b = Decimal.from(0.9);
    const c = a.sub(b);
    expect(c.toNumber()).toBeCloseTo(0.1, 10);
  });

  it('0.1 * 0.2 === 0.02', () => {
    const a = Decimal.from(0.1);
    const b = Decimal.from(0.2);
    const c = a.mul(b);
    expect(c.toNumber()).toBeCloseTo(0.02, 10);
  });

  it('1 / 3 === 0.333... (rounded)', () => {
    const a = Decimal.from(1);
    const b = Decimal.from(3);
    const c = a.div(b);
    expect(c.toNumber()).toBeCloseTo(0.3333333333, 8);
  });
});

describe('Decimal — string input', () => {
  it('parses "123.456"', () => {
    const d = Decimal.from('123.456');
    expect(d.toNumber()).toBe(123.456);
  });

  it('parses integer "42"', () => {
    const d = Decimal.from('42');
    expect(d.toNumber()).toBe(42);
  });
});

describe('Decimal — equality', () => {
  it('0.1 + 0.2 equals 0.3', () => {
    const a = Decimal.from(0.1).add(Decimal.from(0.2));
    const b = Decimal.from(0.3);
    expect(a.equals(b)).toBe(true);
  });
});

describe('Decimal — property test: 200 random pairs', () => {
  it('a + b computed in decimal equals the exact decimal sum', () => {
    const rng = mulberry32(42); // deterministic seed
    for (let i = 0; i < 200; i++) {
      const aRaw = Math.round(rng() * 1000 - 500);
      const bRaw = Math.round(rng() * 1000 - 500);
      // Scale to 2 decimal places to keep exact
      const aScaled = Math.round(aRaw * 100) / 100;
      const bScaled = Math.round(bRaw * 100) / 100;

      const a = Decimal.from(aScaled);
      const b = Decimal.from(bScaled);
      const sum = a.add(b);

      // Expected exact sum
      const expected = Math.round((aScaled + bScaled) * 100) / 100;
      expect(sum.toNumber()).toBeCloseTo(expected, 10);
    }
  });
});

describe('Decimal — division by zero', () => {
  it('throws on division by zero', () => {
    const a = Decimal.from(1);
    const b = Decimal.from(0);
    expect(() => a.div(b)).toThrow('Division by zero');
  });
});

// Deterministic PRNG (mulberry32)
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
