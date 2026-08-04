/**
 * @domio/mock-data — deterministic mock data generator.
 *
 * Seeded PRNG (mulberry32) produces identical output for a fixed seed,
 * making it safe for re-runnable test fixtures.
 */

export type {
  MockField,
  MockSpec,
  MockRow,
  MockResult,
  FieldType,
  Distribution,
} from './types.js';

export {
  mulberry32,
  uniform,
  normal,
  lognormal,
  poisson,
  categorical,
  pick,
  shuffle,
  dateBetween,
  datetimeBetween,
} from './rng.js';

export { generate, generateMany } from './generator.js';

export type { RegionQuarterRow, CorrelatedRegionOpts, SeriesPoint, CorrelatedSeriesOpts } from './correlate.js';
export { correlatedRegions, correlatedSeries } from './correlate.js';
