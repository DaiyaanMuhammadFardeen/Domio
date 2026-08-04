/**
 * Mock data type definitions.
 *
 * @module @domio/mock-data
 */

export type FieldType = 'number' | 'string' | 'boolean' | 'date' | 'currency' | 'percent';

export type Distribution =
  | 'uniform'
  | 'normal'
  | 'lognormal'
  | 'poisson'
  | 'categorical'
  | 'linear'
  | 'constant';

export interface MockField {
  name: string;
  type: FieldType;
  distribution?: Distribution | undefined;
  /** Uniform: [min, max] */
  min?: number | undefined;
  max?: number | undefined;
  /** Normal/lognormal: mean */
  mean?: number | undefined;
  /** Normal: stddev; lognormal: stddev */
  stddev?: number | undefined;
  /** Poisson: lambda */
  lambda?: number | undefined;
  /** Categorical: categories array */
  categories?: string[] | undefined;
  /** Linear: [start, end, step] */
  start?: number | undefined;
  end?: number | undefined;
  step?: number | undefined;
  /** Constant: fixed value */
  format?: string | undefined;
}

export interface MockSpec {
  fields: MockField[];
  seed: number;
  n: number;
}

export type MockRow = Record<string, unknown>;

export interface MockResult {
  columns: Array<{ name: string; type: FieldType }>;
  rows: MockRow[];
}
