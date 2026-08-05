import { describe, it, expect } from 'vitest';
import { joinChoropleth, aggregateCategories } from './choropleth.js';
import type { Feature, DataRecord, JoinConfig } from './choropleth.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFeature(id: string, props: Record<string, unknown>): Feature {
  return { type: 'Feature', id, properties: props };
}

const features: Feature[] = [
  makeFeature('1', { ISO_A3: 'USA', name: 'United States' }),
  makeFeature('2', { ISO_A3: 'GBR', name: 'United Kingdom' }),
  makeFeature('3', { ISO_A3: 'FRA', name: 'France' }),
  makeFeature('4', { ISO_A3: 'DEU', name: 'Germany' }),
  makeFeature('5', { ISO_A3: 'JPN', name: 'Japan' }),
  makeFeature('6', { ISO_A3: 'NODATA', name: 'No Data Land' }),
];

const data: DataRecord[] = [
  { country_code: 'USA', gdp: 25462700 },
  { country_code: 'GBR', gdp: 3070670 },
  { country_code: 'FRA', gdp: 2782910 },
  // Germany and Japan missing from data — should be unmatched
];

const joinConfig: JoinConfig = {
  featureKey: 'ISO_A3',
  dataKey: 'country_code',
  valueField: 'gdp',
};

// ---------------------------------------------------------------------------
// joinChoropleth tests
// ---------------------------------------------------------------------------

describe('joinChoropleth', () => {
  it('joins matching features to data records', () => {
    const result = joinChoropleth(features, data, joinConfig);
    expect(result.joined).toHaveLength(3);
  });

  it('populates unmatched for features with no matching data', () => {
    const result = joinChoropleth(features, data, joinConfig);
    // DEU (Germany), JPN (Japan), NODATA — all unmatched
    expect(result.unmatched).toHaveLength(3);
    const unmatchedIds = result.unmatched.map((f) => f.id);
    expect(unmatchedIds).toContain('4'); // DEU
    expect(unmatchedIds).toContain('5'); // JPN
    expect(unmatchedIds).toContain('6'); // NODATA
  });

  it('joins the value field correctly', () => {
    const result = joinChoropleth(features, data, joinConfig);
    const usa = result.joined.find((j) => j.feature.id === '1');
    expect(usa?.value).toBe(25462700);
  });

  it('counts categories correctly', () => {
    const result = joinChoropleth(features, data, joinConfig);
    expect(result.categoryCounts['25462700']).toBe(1); // USA GDP
    expect(result.categoryCounts['3070670']).toBe(1); // GBR GDP
    expect(result.categoryCounts['2782910']).toBe(1); // FRA GDP
  });

  it('reports cappedToOther as false when < 50 categories', () => {
    const result = joinChoropleth(features, data, joinConfig);
    expect(result.cappedToOther).toBe(false);
  });

  it('handles empty data array', () => {
    const result = joinChoropleth(features, [], joinConfig);
    expect(result.joined).toHaveLength(0);
    expect(result.unmatched).toHaveLength(6);
  });

  it('handles empty features array', () => {
    const result = joinChoropleth([], data, joinConfig);
    expect(result.joined).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('joins entire record when valueField is omitted', () => {
    const config: JoinConfig = {
      featureKey: 'ISO_A3',
      dataKey: 'country_code',
    };
    const result = joinChoropleth(features, data, config);
    const usa = result.joined.find((j) => j.feature.id === '1');
    expect(usa?.value).toEqual({ country_code: 'USA', gdp: 25462700 });
  });

  it('preserves feature order in joined results', () => {
    const result = joinChoropleth(features, data, joinConfig);
    // USA (1), GBR (2), FRA (3) — in original order
    expect(result.joined[0]?.feature.id).toBe('1');
    expect(result.joined[1]?.feature.id).toBe('2');
    expect(result.joined[2]?.feature.id).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// aggregateCategories tests
// ---------------------------------------------------------------------------

describe('aggregateCategories', () => {
  it('returns identity mapping when ≤ maxCategories', () => {
    const counts = { A: 10, B: 5, C: 3 };
    const mapping = aggregateCategories(counts, 50);
    expect(mapping).toEqual({ A: 'A', B: 'B', C: 'C' });
  });

  it('aggregates into top N + "other" when > maxCategories', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      counts[`cat_${i}`] = i + 1; // cat_59 has highest count
    }
    const mapping = aggregateCategories(counts, 50);
    const uniqueValues = new Set(Object.values(mapping));
    // Should have 50 named categories + "other"
    expect(uniqueValues.has('other')).toBe(true);
    // The top 50 by count should keep their names
    expect(mapping['cat_59']).toBe('cat_59'); // highest count
    expect(mapping['cat_58']).toBe('cat_58'); // second highest
    // The bottom 10 should be "other"
    expect(mapping['cat_0']).toBe('other');
    expect(mapping['cat_9']).toBe('other');
  });

  it('is deterministic — same counts always produce same mapping', () => {
    const counts = { A: 10, B: 5, C: 3, D: 1 };
    const m1 = aggregateCategories(counts, 2);
    const m2 = aggregateCategories(counts, 2);
    expect(m1).toEqual(m2);
  });

  it('handles empty category counts', () => {
    const mapping = aggregateCategories({}, 50);
    expect(mapping).toEqual({});
  });
});
