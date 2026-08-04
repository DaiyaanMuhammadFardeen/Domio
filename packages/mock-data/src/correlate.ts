/**
 * Correlated data generators for region × quarter matrices
 * and multi-series with shared trends.
 */

import { mulberry32, uniform, normal } from './rng.js';

export interface RegionQuarterRow {
  region: string;
  quarter: string;
  value: number;
}

export interface CorrelatedRegionOpts {
  seed?: number;
  base?: number;
  vol?: number;
}

/**
 * Generate a region × quarter matrix with correlated growth.
 * Later quarters trend upward from base with per-region volatility.
 */
export function correlatedRegions(
  regions: string[],
  quarters: string[],
  opts: CorrelatedRegionOpts = {},
): RegionQuarterRow[] {
  const { seed = 42, base = 100, vol = 0.15 } = opts;
  const rng = mulberry32(seed);
  const result: RegionQuarterRow[] = [];

  // Per-region volatility offset
  const regionVol = regions.map(() => 0.8 + rng() * 0.4);

  for (let qi = 0; qi < quarters.length; qi++) {
    const quarter = quarters[qi]!;
    const trendMultiplier = 1 + qi * 0.08; // ~8% growth per quarter

    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri]!;
      const rv = regionVol[ri]!;
      const noise = normal(rng, 0, vol * rv);
      const value = Math.round((base * trendMultiplier + noise * base) * 100) / 100;
      result.push({ region, quarter, value: Math.max(0, value) });
    }
  }

  return result;
}

export interface SeriesPoint {
  key: string;
  index: number;
  value: number;
}

export interface CorrelatedSeriesOpts {
  seed?: number;
  base?: number;
  volatility?: number;
  n?: number;
}

/**
 * Generate multiple series sharing a trend with per-series offsets.
 * Each series follows a shared random walk + offset.
 */
export function correlatedSeries(
  keys: string[],
  opts: CorrelatedSeriesOpts = {},
): SeriesPoint[] {
  const { seed = 42, base = 50, volatility = 5, n = 12 } = opts;
  const rng = mulberry32(seed);
  const result: SeriesPoint[] = [];

  // Per-series offset
  const offsets = keys.map(() => uniform(rng, -20, 20));

  let trend = base;
  for (let i = 0; i < n; i++) {
    // Shared trend walk
    trend += normal(rng, 2, volatility);

    for (let ki = 0; ki < keys.length; ki++) {
      result.push({
        key: keys[ki]!,
        index: i,
        value: Math.round((trend + offsets[ki]!) * 100) / 100,
      });
    }
  }

  return result;
}
