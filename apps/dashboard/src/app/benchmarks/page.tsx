/**
 * /benchmarks — server component.
 *
 * Ranked table of benchmarks (industry, region, metric, p25/median/
 * p75/p95) with industry filter + power-analysis calculator at the
 * bottom. The benchmark service is currently stubbed; once
 * services/benchmark is online (Phase 17 W11+) the fetcher will hit
 * BENCHMARK_URL /v1/benchmarks.
 */

import { fetcher } from '../../lib/fetcher';

const BENCHMARK_URL =
  process.env['BENCHMARK_URL'] ?? 'http://localhost:8096';

interface Benchmark {
  industry: string;
  region: string;
  metric: string;
  sampleSize: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
}

const STUB: Benchmark[] = [
  { industry: 'SaaS', region: 'NA', metric: 'session_dwell_ms', sampleSize: 12_400, p25: 8_000, median: 14_200, p75: 22_400, p95: 38_900 },
  { industry: 'SaaS', region: 'EU', metric: 'session_dwell_ms', sampleSize: 8_200, p25: 9_400, median: 15_800, p75: 24_100, p95: 41_300 },
  { industry: 'E-commerce', region: 'NA', metric: 'session_dwell_ms', sampleSize: 5_600, p25: 4_200, median: 7_800, p75: 13_900, p95: 28_200 },
  { industry: 'Education', region: 'APAC', metric: 'completion_rate', sampleSize: 3_400, p25: 0.32, median: 0.48, p75: 0.61, p95: 0.78 },
];

async function fetchBenchmarks(): Promise<Benchmark[]> {
  try {
    const json = await fetcher<{ rows: Benchmark[] }>(BENCHMARK_URL, '/v1/benchmarks');
    return json.rows ?? [];
  } catch {
    return STUB;
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
function requiredSampleSize(baseline: number, mde: number, alpha: number, power: number): number {
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
function inverseNormalCDF(p: number): number {
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

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ industry?: string }>;
}) {
  const params = await searchParams;
  const all = await fetchBenchmarks();
  const industries = Array.from(new Set(all.map((b) => b.industry))).sort();
  const industryFilter = params.industry ?? '';
  const rows = industryFilter
    ? all.filter((b) => b.industry === industryFilter)
    : all;

  // Default MDE calculator inputs.
  const baseline = 0.05;
  const mde = 0.1;
  const alpha = 0.05;
  const power = 0.8;
  const required = requiredSampleSize(baseline, mde, alpha, power);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Benchmarks</h1>
        <p className="text-sm text-slate-500">
          Industry comparisons + power analysis
        </p>
      </header>

      <form className="flex items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Industry
          </span>
          <select
            name="industry"
            defaultValue={industryFilter}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Industry</th>
              <th className="px-4 py-2 text-left">Region</th>
              <th className="px-4 py-2 text-left">Metric</th>
              <th className="px-4 py-2 text-right">n</th>
              <th className="px-4 py-2 text-right">p25</th>
              <th className="px-4 py-2 text-right">median</th>
              <th className="px-4 py-2 text-right">p75</th>
              <th className="px-4 py-2 text-right">p95</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((b, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{b.industry}</td>
                <td className="px-4 py-2">{b.region}</td>
                <td className="px-4 py-2 font-mono text-xs">{b.metric}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.sampleSize.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.p25}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.median}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.p75}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.p95}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Power-analysis calculator (MDE)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Two-proportion z-test. Defaults: baseline {(baseline * 100).toFixed(0)}%, MDE{' '}
          {(mde * 100).toFixed(0)}%, α = {alpha}, power = {power}.
        </p>
        <div className="mt-3 inline-flex items-baseline gap-2 rounded-md bg-slate-50 px-3 py-2">
          <span className="text-xs uppercase text-slate-500">Required n</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {required.toLocaleString()}
          </span>
          <span className="text-xs text-slate-500">per variant</span>
        </div>
      </section>
    </div>
  );
}

export { requiredSampleSize };