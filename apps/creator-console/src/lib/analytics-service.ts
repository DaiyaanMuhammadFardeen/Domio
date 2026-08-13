/**
 * Analytics service — creator-side listing analytics.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Extended in Wave 9 §S9.3 with revenue-series, top-listings, geo
 * distribution, and conversion-funnel primitives. All four are pure
 * seeded projections so the console renders identically without an
 * upstream.
 */

import { fetcher } from './fetcher';
import type {
  AnalyticsBucket,
  AnalyticsPeriod,
  ConversionFunnel,
  GeoBucket,
  RevenuePoint,
  TopListing,
} from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CreatorAnalyticsRow {
  readonly listingId: string;
  readonly views: number;
  readonly conversions: number;
  readonly revenueCents: number;
}

export const BOOTSTRAP_CREATOR_ANALYTICS: ReadonlyArray<CreatorAnalyticsRow> = [];

export async function listCreatorAnalytics(
  workspaceId: string,
): Promise<ReadonlyArray<CreatorAnalyticsRow>> {
  try {
    const json = await fetcher<{ rows?: CreatorAnalyticsRow[] }>(
      API_BASE,
      `/v1/creator/analytics?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Wave 9 §S9.3 — Seeded analytics primitives.
//
// Each helper derives deterministic but varied data so the dashboard is
// visually useful without a backend. The `creatorId` and `period`
// parameters are folded into the seed so refreshing the period selector
// produces a different snapshot.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stable hash so seeded values vary by creator. */
function hashSeed(...parts: ReadonlyArray<string>): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/** Linear-congruential generator seeded from `hashSeed(...)`. */
function makeRng(seed: number): () => number {
  let state = seed === 0 ? 0x9e3779b9 : seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function daysForPeriod(period: AnalyticsPeriod): number {
  switch (period) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case '1y':
      return 365;
  }
}

export function bucketForPeriod(period: AnalyticsPeriod): AnalyticsBucket {
  switch (period) {
    case '7d':
    case '30d':
      return 'day';
    case '90d':
      return 'week';
    case '1y':
      return 'month';
  }
}

function bucketsForPeriod(
  period: AnalyticsPeriod,
  bucket: AnalyticsBucket,
): number {
  const days = daysForPeriod(period);
  if (bucket === 'day') return Math.min(days, 90);
  if (bucket === 'week') return Math.max(1, Math.ceil(days / 7));
  return Math.max(1, Math.ceil(days / 30));
}

function formatCents(cents: number): string {
  const amount = Math.round(cents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRevenueCents(cents: number): string {
  return formatCents(cents);
}

/**
 * Daily revenue series for the requested period.
 *
 * `creatorId` and `period` are folded into the seed so different periods
 * produce different shapes; revenue sits in the $120–$480/day range with
 * a small refund component (up to ~5%).
 */
export async function getRevenueSeries(
  creatorId: string,
  period: AnalyticsPeriod,
  bucket: AnalyticsBucket,
): Promise<RevenuePoint[]> {
  const seed = hashSeed(creatorId, period, bucket, 'revenue');
  const rng = makeRng(seed);
  const points = bucketsForPeriod(period, bucket);
  const now = Date.now();
  const series: RevenuePoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const ts = now - i * DAY_MS;
    // Revenue: $120..$480 = 12000..48000 cents.
    const revenueCents = Math.round(12000 + rng() * 36000);
    // Refunds: 0..5% of revenue.
    const refundsCents = Math.round(revenueCents * (rng() * 0.05));
    series.push({
      timestamp_ms: ts,
      revenue_cents: revenueCents,
      refunds_cents: refundsCents,
    });
  }
  return series;
}

/**
 * Top listings by revenue. Always returns 6 rows, descending by revenue.
 */
export async function getTopListings(
  creatorId: string,
  period: AnalyticsPeriod,
): Promise<TopListing[]> {
  const seed = hashSeed(creatorId, period, 'top-listings');
  const rng = makeRng(seed);
  const TITLES = [
    'Sunset Gradient Theme',
    'Monaco Code Stickers',
    'Minimal Data Icons',
    'Conference Talk Template',
    'Holographic Widget Pack',
    'Pitch Deck Builder',
  ];
  const rows: TopListing[] = TITLES.map((title, i) => {
    // Revenue $1k..$22k.
    const revenue = Math.round(100000 + rng() * 2100000);
    // Units scale with revenue — 5..500 units per listing.
    const units = Math.max(5, Math.round(revenue / 4500));
    // Conversion 1..12%.
    const conv = 0.01 + rng() * 0.11;
    return {
      listing_id: `lst_${i + 1}`,
      title,
      revenue_cents: revenue,
      units_sold: units,
      conversion_rate: Number(conv.toFixed(4)),
    };
  });
  return rows.sort((a, b) => b.revenue_cents - a.revenue_cents);
}

/**
 * Geographic distribution. Returns 8 countries sorted by revenue.
 */
export async function getGeoDistribution(
  creatorId: string,
  period: AnalyticsPeriod,
): Promise<GeoBucket[]> {
  const seed = hashSeed(creatorId, period, 'geo');
  const rng = makeRng(seed);
  const COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'JP', name: 'Japan' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
  ];
  const rows: GeoBucket[] = COUNTRIES.map((c) => ({
    country_code: c.code,
    country_name: c.name,
    installs: Math.round(200 + rng() * 4800),
    revenue_cents: Math.round(50000 + rng() * 950000),
  }));
  return rows.sort((a, b) => b.revenue_cents - a.revenue_cents);
}

/**
 * Conversion funnel derived from seeded views/trials/purchases.
 * Rates are clamped to `[0, 1]` and consistent with the raw counts.
 */
export async function getConversionFunnel(
  creatorId: string,
  period: AnalyticsPeriod,
): Promise<ConversionFunnel> {
  const seed = hashSeed(creatorId, period, 'funnel');
  const rng = makeRng(seed);
  const views = Math.round(8000 + rng() * 40000);
  // View → trial: 5..20%
  const viewToTrial = 0.05 + rng() * 0.15;
  const trialStarts = Math.max(1, Math.round(views * viewToTrial));
  // Trial → purchase: 15..45%
  const trialToPurchase = 0.15 + rng() * 0.3;
  const purchases = Math.max(1, Math.round(trialStarts * trialToPurchase));
  const viewToTrialRate = clamp01(trialStarts / views);
  const trialToPurchaseRate = clamp01(purchases / trialStarts);
  const overallRate = clamp01(purchases / views);
  return {
    views,
    trial_starts: trialStarts,
    purchases,
    view_to_trial_rate: Number(viewToTrialRate.toFixed(4)),
    trial_to_purchase_rate: Number(trialToPurchaseRate.toFixed(4)),
    overall_conversion_rate: Number(overallRate.toFixed(4)),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
