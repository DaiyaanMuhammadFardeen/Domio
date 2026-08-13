/**
 * benchmark-service — typed client for industry benchmarks.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/benchmarks` on the benchmark service. When the
 * service is unreachable the loader returns an empty list — the page
 * then renders an empty state. We never fabricate peer rows.
 */

import { fetcher } from './fetcher';

export interface Benchmark {
  readonly industry: string;
  readonly region: string;
  readonly metric: string;
  readonly sampleSize: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
}

interface BenchmarkWire {
  industry?: string;
  region?: string;
  metric?: string;
  sample_size?: number;
  p25?: number;
  median?: number;
  p75?: number;
  p95?: number;
}

function mapBenchmark(raw: BenchmarkWire): Benchmark {
  return {
    industry: String(raw.industry ?? ''),
    region: String(raw.region ?? ''),
    metric: String(raw.metric ?? ''),
    sampleSize: Number(raw.sample_size ?? 0),
    p25: Number(raw.p25 ?? 0),
    median: Number(raw.median ?? 0),
    p75: Number(raw.p75 ?? 0),
    p95: Number(raw.p95 ?? 0),
  };
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['BENCHMARK_URL'] : undefined) ??
  'http://localhost:8096';

/**
 * Fetch the benchmark rows for a workspace.
 *
 * Returns an empty array on any failure. The caller renders an empty
 * state in that case — never fabricated rows.
 */
export async function listBenchmarks(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<Benchmark>> {
  try {
    const json = await fetcher<{ benchmarks?: BenchmarkWire[] }>(
      baseUrl,
      '/v1/analytics/benchmarks',
      { workspaceId },
    );
    return (json.benchmarks ?? []).map(mapBenchmark);
  } catch {
    return [];
  }
}

/**
 * Workspace-vs-peer comparison row used by the BenchmarkChart. The
 * chart highlights how the workspace's completion rate compares to
 * the peer p25/median/p75 plus an actionable suggestion.
 *
 * Per Wave 7 §S7.9 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 */
export interface PeerBenchmark {
  readonly segment: string;
  readonly workspaceValue: number;
  readonly peerP25: number;
  readonly peerMedian: number;
  readonly peerP75: number;
  readonly peerSampleSize: number;
  /** Percentile rank of workspaceValue within the peer distribution (0–100). */
  readonly percentile: number;
  /** Plain-English suggestion ("in the 90th percentile", etc.). */
  readonly suggestion: string;
}

interface PeerBenchmarkWire {
  segment?: string;
  workspace_value?: number;
  peer_p25?: number;
  peer_median?: number;
  peer_p75?: number;
  peer_sample_size?: number;
  percentile?: number;
  suggestion?: string;
}

function clampPercentile(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

function defaultSuggestion(percentile: number): string {
  if (percentile >= 90) return 'Top decile — your deck outperforms peers.';
  if (percentile >= 75) return 'Above-average completion. Try A/B on the cover slide.';
  if (percentile >= 50) return 'Median performance — opportunity to improve with personalization.';
  if (percentile >= 25) return 'Below median. Investigate drop-off slides in the funnel report.';
  return 'Bottom quartile — review template structure and CTA placement.';
}

function mapPeerBenchmark(raw: PeerBenchmarkWire): PeerBenchmark {
  const percentile = clampPercentile(Number(raw.percentile ?? 50));
  return {
    segment: String(raw.segment ?? 'all'),
    workspaceValue: Number(raw.workspace_value ?? 0),
    peerP25: Number(raw.peer_p25 ?? 0),
    peerMedian: Number(raw.peer_median ?? 0),
    peerP75: Number(raw.peer_p75 ?? 0),
    peerSampleSize: Number(raw.peer_sample_size ?? 0),
    percentile,
    suggestion: String(raw.suggestion ?? defaultSuggestion(percentile)),
  };
}

/**
 * Fetch peer benchmarks for a workspace. Returns an empty list on
 * any failure — the chart renders an empty state.
 */
export async function listPeerBenchmarks(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<PeerBenchmark>> {
  try {
    const json = await fetcher<{ rows?: PeerBenchmarkWire[] }>(
      baseUrl,
      '/v1/analytics/benchmarks/peers',
      { workspaceId },
    );
    return (json.rows ?? []).map(mapPeerBenchmark);
  } catch {
    return [];
  }
}

/**
 * Required sample size for a two-proportion z-test:
 *
 *   n = (z_{1-α/2} + z_{1-β})^2 · (p1(1-p1) + p2(1-p2)) / (p2 - p1)^2
 *
 * where p2 = p1 * (1 + mde), mde is the relative minimum detectable
 * effect, α is the two-sided significance level, and 1-β is the power.
 */
export function requiredSampleSize(
  baseline: number,
  mde: number,
  alpha: number,
  power: number,
): number {
  if (baseline <= 0 || baseline >= 1) return 0;
  if (mde <= 0) return 0;
  const zAlpha = inverseNormalCDF(1 - alpha / 2);
  const zBeta = inverseNormalCDF(power);
  const p1 = baseline;
  const p2 = baseline * (1 + mde);
  const numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const denom = Math.pow(p2 - p1, 2);
  return Math.ceil(numerator / denom);
}

/** Beasley-Springer-Moro approximation of the inverse normal CDF. */
export function inverseNormalCDF(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}