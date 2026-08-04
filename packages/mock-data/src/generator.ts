/**
 * Deterministic mock data generator.
 *
 * Same seed + same spec ⇒ identical rows (re-runnable fixture).
 */

import type { MockField, MockSpec, MockResult, MockRow, FieldType, Distribution } from './types.js';
import {
  mulberry32,
  uniform,
  normal,
  lognormal,
  poisson,
  categorical,
  dateBetween,
} from './rng.js';

/** Default distribution per field type when unspecified. */
function defaultDistribution(type: FieldType): Distribution {
  switch (type) {
    case 'number':
      return 'uniform';
    case 'string':
      return 'categorical';
    case 'boolean':
      return 'uniform';
    case 'date':
    case 'currency':
    case 'percent':
      return 'uniform';
    default:
      return 'uniform';
  }
}

/** Generate a single value for a field. */
function generateValue(rng: () => number, field: MockField): unknown {
  const dist = field.distribution ?? defaultDistribution(field.type);

  switch (field.type) {
    case 'number':
      return generateNumber(rng, dist, field);
    case 'string':
      return generateString(rng, dist, field);
    case 'boolean':
      return rng() > 0.5;
    case 'date': {
      const start = field.min !== undefined ? new Date(field.min) : new Date('2020-01-01');
      const end = field.max !== undefined ? new Date(field.max) : new Date('2025-12-31');
      return dateBetween(rng, start, end).toISOString().slice(0, 10);
    }
    case 'currency':
      return generateNumber(rng, dist, { ...field, min: field.min ?? 0, max: field.max ?? 10000 });
    case 'percent':
      return generateNumber(rng, dist, { ...field, min: field.min ?? 0, max: field.max ?? 100 });
    default:
      return 0;
  }
}

function generateNumber(rng: () => number, dist: Distribution, field: MockField): number {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const mean = field.mean ?? (min + max) / 2;
  const stddev = field.stddev ?? (max - min) / 6;
  const lambda = field.lambda ?? 5;

  switch (dist) {
    case 'uniform':
      return Math.round(uniform(rng, min, max) * 100) / 100;
    case 'normal':
      return Math.round(normal(rng, mean, stddev) * 100) / 100;
    case 'lognormal':
      return Math.round(lognormal(rng, mean, stddev) * 100) / 100;
    case 'poisson':
      return poisson(rng, lambda);
    case 'linear': {
      const start = field.start ?? min;
      const end = field.end ?? max;
      const step = field.step ?? 1;
      const steps = Math.floor((end - start) / step);
      return start + (rng() * steps | 0) * step;
    }
    case 'constant':
      return min;
    default:
      return Math.round(uniform(rng, min, max) * 100) / 100;
  }
}

function generateString(rng: () => number, dist: Distribution, field: MockField): string {
  if (dist === 'categorical' && field.categories && field.categories.length > 0) {
    return categorical(rng, field.categories);
  }
  // Generate random alphanumeric strings
  const len = 5 + Math.floor(rng() * 10);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

/**
 * Generate n rows of deterministic mock data from a spec.
 * Same seed ⇒ identical output (re-runnable fixture).
 */
export function generate(spec: MockSpec): MockResult {
  const rng = mulberry32(spec.seed);
  const columns = spec.fields.map((f) => ({ name: f.name, type: f.type }));
  const rows: MockRow[] = [];

  for (let i = 0; i < spec.n; i++) {
    const row: MockRow = {};
    for (const field of spec.fields) {
      row[field.name] = generateValue(rng, field);
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Generate multiple correlated datasets sharing a base seed.
 * Each spec uses baseSeed + index for its seed.
 */
export function generateMany(
  specs: MockSpec[],
  baseSeed: number,
): MockResult[] {
  return specs.map((spec, i) =>
    generate({ ...spec, seed: baseSeed + i }),
  );
}
