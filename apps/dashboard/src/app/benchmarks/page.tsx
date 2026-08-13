/**
 * /benchmarks — server component.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/benchmarks`.
 *   - No STUB fallback.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Ranked table of benchmarks (industry, region, metric, p25/median/
 * p75/p95) with industry filter + power-analysis calculator at the
 * bottom.
 *
 * Wave 7 §S7.9 mounts BenchmarkChart that compares the workspace's
 * deck completion rate to per-segment peers and surfaces suggestions.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { BenchmarkChart } from '../../components/BenchmarkChart';
import {
  listBenchmarks,
  listPeerBenchmarks,
  requiredSampleSize,
} from '../../lib/benchmark-service';

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ industry?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const [all, peerRows] = await Promise.all([
    listBenchmarks(workspaceId),
    listPeerBenchmarks(workspaceId),
  ]);
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

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Workspace vs peers
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          How your deck completion rate compares to anonymized peers by segment.
        </p>
        <div className="mt-3">
          <BenchmarkChart workspaceId={workspaceId} initial={peerRows} />
        </div>
      </section>

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

      <SuspenseBoundary>
        {rows.length === 0 ? (
          <EmptyState
            title="No benchmarks yet"
            description="The benchmark service has no peer rows for this workspace. Industry / region / metric data will populate as soon as the benchmark service reports."
          />
        ) : (
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
                  <tr key={`${b.industry}-${b.region}-${b.metric}-${i}`}>
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
        )}
      </SuspenseBoundary>

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