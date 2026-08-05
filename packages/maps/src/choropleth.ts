/**
 * Choropleth join — join TopoJSON/GeoJSON feature properties to an external
 * data array by a configurable key. Handles unmatched features and the
 * 50-category cap (top 50 + "other" aggregation).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A generic GeoJSON/TopoJSON feature (simplified — no geometry needed for the join). */
export interface Feature {
  readonly type: 'Feature';
  readonly id?: string | number;
  readonly properties: Record<string, unknown>;
}

export interface DataRecord {
  readonly [key: string]: unknown;
}

export interface JoinConfig {
  /** The feature property to match on (e.g. "ISO_A3"). */
  readonly featureKey: string;
  /** The data field to match on (e.g. "country_code"). */
  readonly dataKey: string;
  /** The data field whose value becomes the joined value. If omitted, the entire record is joined. */
  readonly valueField?: string;
}

export interface JoinResult<TFeature extends Feature = Feature> {
  /** Features that successfully matched a data record. */
  readonly joined: Array<{ feature: TFeature; value: unknown }>;
  /** Features that had no matching data record. */
  readonly unmatched: readonly TFeature[];
  /** Map of category → count (before capping). */
  readonly categoryCounts: Readonly<Record<string, number>>;
  /** Categories that were aggregated into "other" (only when > 50 unique). */
  readonly cappedToOther: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CATEGORIES = 50;

// ---------------------------------------------------------------------------
// Join logic
// ---------------------------------------------------------------------------

/**
 * Join an array of features to an array of data records.
 *
 * Deterministic: the result is the same for identical inputs regardless of
 * insertion order (features retain their original order).
 */
export function joinChoropleth<
  TFeature extends Feature = Feature,
  TData extends DataRecord = DataRecord,
>(
  features: readonly TFeature[],
  data: readonly TData[],
  config: JoinConfig,
): JoinResult<TFeature> {
  const { featureKey, dataKey, valueField } = config;

  // Build a lookup from data records by dataKey
  const dataMap = new Map<string, TData>();
  for (const record of data) {
    const key = String(record[dataKey]);
    dataMap.set(key, record);
  }

  const joined: Array<{ feature: TFeature; value: unknown }> = [];
  const unmatched: TFeature[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const feature of features) {
    const featureVal = feature.properties[featureKey];
    if (featureVal === undefined || featureVal === null) {
      unmatched.push(feature);
      continue;
    }
    const key = String(featureVal);
    const record = dataMap.get(key);
    if (!record) {
      unmatched.push(feature);
      continue;
    }
    const value = valueField !== undefined ? record[valueField] : record;
    joined.push({ feature, value });

    // Count categories
    const category = String(value);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  // Check category cap: if > MAX_CATEGORIES unique, the caller should aggregate
  // into top 50 + "other". We return the raw counts; the caller decides.
  const uniqueCategories = Object.keys(categoryCounts).length;
  const cappedToOther = uniqueCategories > MAX_CATEGORIES;

  return { joined, unmatched, categoryCounts, cappedToOther };
}

/**
 * Aggregate categories: keeps the top `maxCategories` by count and renames
 * the rest to "other".
 *
 * Returns a mapping from original category → display category.
 */
export function aggregateCategories(
  categoryCounts: Readonly<Record<string, number>>,
  maxCategories: number = MAX_CATEGORIES,
): Readonly<Record<string, string>> {
  const entries = Object.entries(categoryCounts);

  if (entries.length <= maxCategories) {
    // No aggregation needed — identity mapping
    const result: Record<string, string> = {};
    for (const [cat] of entries) {
      result[cat] = cat;
    }
    return result;
  }

  // Sort by count descending
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const topN = sorted.slice(0, maxCategories);
  const topSet = new Set(topN.map(([cat]) => cat));

  const result: Record<string, string> = {};
  for (const [cat] of entries) {
    result[cat] = topSet.has(cat) ? cat : 'other';
  }
  return result;
}
