import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  uniform,
  normal,
  lognormal,
  poisson,
  categorical,
  pick,
  shuffle,
  dateBetween,
} from './rng.js';
import { correlatedRegions, correlatedSeries } from './correlate.js';
import { generate } from './generator.js';
import type { MockSpec } from './types.js';

describe('rng distributions', () => {
  it('mulberry32 produces values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('uniform stays within bounds', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const v = uniform(rng, 10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('normal produces values centered on mean', () => {
    const rng = mulberry32(42);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(normal(rng, 100, 10));
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(avg).toBeGreaterThan(90);
    expect(avg).toBeLessThan(110);
  });

  it('lognormal produces positive values', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      expect(lognormal(rng, 0, 1)).toBeGreaterThan(0);
    }
  });

  it('poisson produces non-negative integers', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const v = poisson(rng, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('categorical picks from the categories', () => {
    const rng = mulberry32(42);
    const cats = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(cats).toContain(categorical(rng, cats));
    }
  });

  it('pick returns array elements', () => {
    const rng = mulberry32(42);
    const arr = [1, 2, 3, 4, 5];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pick(rng, arr));
    }
  });

  it('shuffle returns all original elements', () => {
    const rng = mulberry32(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffle(rng, [...arr]);
    expect(shuffled.sort((a, b) => a - b)).toEqual(arr);
  });

  it('dateBetween returns dates within range', () => {
    const rng = mulberry32(42);
    const start = new Date('2020-01-01');
    const end = new Date('2025-12-31');
    for (let i = 0; i < 100; i++) {
      const d = dateBetween(rng, start, end);
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });
});

describe('correlatedRegions', () => {
  it('produces region × quarter matrix', () => {
    const regions = ['NA', 'EU', 'APAC'];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const rows = correlatedRegions(regions, quarters, { seed: 42 });
    expect(rows.length).toBe(12);
  });

  it('later quarters trend upward (monotonic-ish)', () => {
    const rows = correlatedRegions(['US'], ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'], {
      seed: 42,
      base: 100,
      vol: 0.01,
    });
    const byQ = rows.map((r) => r.value);
    // With very low volatility, should be strictly increasing
    for (let i = 1; i < byQ.length; i++) {
      expect(byQ[i]!).toBeGreaterThan(byQ[i - 1]!);
    }
  });

  it('values are always non-negative', () => {
    const rows = correlatedRegions(['A', 'B'], ['Q1', 'Q2', 'Q3'], { seed: 7, vol: 0.5 });
    for (const r of rows) {
      expect(r.value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('correlatedSeries', () => {
  it('produces correct count', () => {
    const rows = correlatedSeries(['a', 'b', 'c'], { seed: 42, n: 10 });
    expect(rows.length).toBe(30);
  });

  it('keys are preserved', () => {
    const rows = correlatedSeries(['x', 'y'], { seed: 42, n: 5 });
    const keys = new Set(rows.map((r) => r.key));
    expect(keys).toEqual(new Set(['x', 'y']));
  });

  it('indices range from 0 to n-1', () => {
    const rows = correlatedSeries(['s'], { seed: 42, n: 20 });
    const indices = rows.map((r) => r.index).sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

describe('generator distributions', () => {
  it('uniform number stays in bounds', () => {
    const spec: MockSpec = {
      fields: [{ name: 'v', type: 'number', distribution: 'uniform', min: 10, max: 20 }],
      seed: 42,
      n: 200,
    };
    const { rows } = generate(spec);
    for (const r of rows) {
      const v = r['v'] as number;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('categorical string picks from list', () => {
    const cats = ['red', 'green', 'blue'];
    const spec: MockSpec = {
      fields: [{ name: 'color', type: 'string', distribution: 'categorical', categories: cats }],
      seed: 42,
      n: 100,
    };
    const { rows } = generate(spec);
    for (const r of rows) {
      expect(cats).toContain(r['color']);
    }
  });

  it('boolean produces true/false', () => {
    const spec: MockSpec = {
      fields: [{ name: 'flag', type: 'boolean' }],
      seed: 42,
      n: 100,
    };
    const { rows } = generate(spec);
    for (const r of rows) {
      expect(typeof r['flag']).toBe('boolean');
    }
  });

  it('poisson produces non-negative integers', () => {
    const spec: MockSpec = {
      fields: [{ name: 'count', type: 'number', distribution: 'poisson', lambda: 10 }],
      seed: 42,
      n: 200,
    };
    const { rows } = generate(spec);
    for (const r of rows) {
      const v = r['count'] as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('n rows always produced for various n', () => {
    for (const n of [0, 1, 50, 500]) {
      const spec: MockSpec = {
        fields: [{ name: 'x', type: 'number' }],
        seed: 1,
        n,
      };
      expect(generate(spec).rows.length).toBe(n);
    }
  });
});
