import { describe, it, expect } from 'vitest';
import { generate, generateMany } from './generator.js';
import type { MockSpec } from './types.js';

function makeSpec(seed: number, n = 50): MockSpec {
  return {
    fields: [
      { name: 'id', type: 'number', min: 1, max: 1000 },
      { name: 'name', type: 'string', categories: ['Alice', 'Bob', 'Carol', 'Dave'] },
      { name: 'active', type: 'boolean' },
      { name: 'score', type: 'number', min: 0, max: 100, distribution: 'normal', mean: 50, stddev: 15 },
      { name: 'amount', type: 'currency', min: 10, max: 5000 },
      { name: 'ratio', type: 'percent', min: 0, max: 100 },
    ],
    seed,
    n,
  };
}

describe('deterministic generation', () => {
  it('same seed produces identical rows (100 runs)', () => {
    const spec = makeSpec(42);
    const baseline = generate(spec);

    for (let run = 0; run < 100; run++) {
      const result = generate(spec);
      expect(result.rows).toEqual(baseline.rows);
      expect(result.columns).toEqual(baseline.columns);
    }
  });

  it('different seeds produce different rows', () => {
    const a = generate(makeSpec(1));
    const b = generate(makeSpec(2));
    // With 50 rows of varied data, at least one row should differ
    const firstRowA = JSON.stringify(a.rows[0]);
    const firstRowB = JSON.stringify(b.rows[0]);
    expect(firstRowA).not.toBe(firstRowB);
  });

  it('produces exactly n rows', () => {
    for (const n of [0, 1, 10, 100, 1000]) {
      const result = generate(makeSpec(7, n));
      expect(result.rows.length).toBe(n);
    }
  });

  it('columns match field definitions', () => {
    const result = generate(makeSpec(99));
    expect(result.columns.map((c) => c.name)).toEqual(['id', 'name', 'active', 'score', 'amount', 'ratio']);
    expect(result.columns.map((c) => c.type)).toEqual(['number', 'string', 'boolean', 'number', 'currency', 'percent']);
  });
});

describe('generateMany', () => {
  it('produces separate results with shifted seeds', () => {
    const specs = [makeSpec(10, 5), makeSpec(10, 5)];
    const results = generateMany(specs, 100);
    expect(results.length).toBe(2);
    // Same field spec but different effective seeds → different rows
    expect(results[0]!.rows).not.toEqual(results[1]!.rows);
  });

  it('first result is deterministic per its effective seed', () => {
    const specs = [makeSpec(0, 10)];
    const a = generateMany(specs, 50);
    const b = generateMany(specs, 50);
    expect(a[0]!.rows).toEqual(b[0]!.rows);
  });
});
