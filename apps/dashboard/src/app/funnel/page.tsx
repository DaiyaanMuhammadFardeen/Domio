/**
 * /funnel — per-deck funnel report.
 *
 * Per Wave 7 §S7.2 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Renders viewers → opened → reached slide N → converted.
 *   - Drop-off slide annotations + AI "why?" button per slide.
 *   - Time-series by week cohort.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Wired to `GET /v1/analytics/funnel` on the warehouse. Renders an
 * empty state when the upstream is unreachable — never a fabricated
 * funnel.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { FunnelChart } from '../../components/FunnelChart';
import { SlideBreakdownTable } from '../../components/SlideBreakdownTable';
import { fetchFunnelReport } from '../../lib/funnel-service';
import { fetchDecks } from '../../lib/deck-service';

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string }>;
}) {
  const params = await searchParams;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const decks = await fetchDecks(workspaceId);
  const deckId = params.deckId ?? decks[0]?.deckId ?? 'deck-demo';
  const report = await fetchFunnelReport(workspaceId, deckId);

  if (!report) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Funnel</h1>
          <p className="text-sm text-slate-500">
            Deck <code className="rounded bg-slate-100 px-1.5 py-0.5">{deckId}</code>
          </p>
        </header>
        <SuspenseBoundary>
          <EmptyState
            title="No funnel data"
            description="The warehouse has not reported a funnel for this deck. Once viewer traffic exists, the funnel and slide-level breakdown will populate."
          />
        </SuspenseBoundary>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Funnel</h1>
        <p className="text-sm text-slate-500">
          Deck <code className="rounded bg-slate-100 px-1.5 py-0.5">{report.deckId}</code> · workspace{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{report.workspaceId}</code>
        </p>
      </header>

      <SuspenseBoundary>
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Funnel
            </h2>
            <FunnelChart
              steps={report.steps}
              dropoffLabel={(step, i) => {
                if (i === 0) return null;
                const prev = report.steps[i - 1];
                if (!prev) return null;
                const lost = Math.max(0, prev.value - step.value);
                return `${lost.toLocaleString()} lost`;
              }}
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Weekly cohort
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Week</th>
                    <th className="px-4 py-2 text-right">Viewers</th>
                    <th className="px-4 py-2 text-right">Conversions</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.weeklyCohort.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-sm text-slate-500"
                      >
                        No weekly cohort yet.
                      </td>
                    </tr>
                  ) : (
                    report.weeklyCohort.map((w) => (
                      <tr key={w.weekStart}>
                        <td className="px-4 py-2 font-mono text-xs">{w.weekStart}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{w.viewers.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{w.conversions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {w.viewers > 0
                            ? `${((w.conversions / w.viewers) * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Slide-level breakdown
          </h2>
          <SlideBreakdownTable
            slides={report.slides}
            deckId={report.deckId}
            workspaceId={report.workspaceId}
          />
        </section>
      </SuspenseBoundary>
    </div>
  );
}