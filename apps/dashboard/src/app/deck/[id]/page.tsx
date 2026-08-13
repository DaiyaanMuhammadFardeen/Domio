/**
 * /deck/[id] — server component.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/decks/{id}` + slide breakdown.
 *   - No fabrication; renders an empty state when the warehouse
 *     returns nothing.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 */

import { notFound } from 'next/navigation';
import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { DeckSummaryCard } from './DeckSummaryCard';
import { SlideBreakdownTable } from './SlideBreakdownTable';
import {
  fetchDeckSummary,
  fetchSlideBreakdown,
} from '../../../lib/deck-service';

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const summary = await fetchDeckSummary(workspaceId, id);
  if (!summary && process.env['DASHBOARD_STRICT'] === '1') notFound();
  const slides = await fetchSlideBreakdown(workspaceId, id);

  const hasData = summary !== null && summary.sessionCount > 0;
  const hasSlides = slides.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deck {id}</h1>
        <p className="text-sm text-slate-500">
          30-day window · workspace <code className="rounded bg-slate-100 px-1.5 py-0.5">{workspaceId}</code>
        </p>
      </header>
      <SuspenseBoundary>
        {summary && hasData ? (
          <DeckSummaryCard
            totalSessions={summary.sessionCount}
            viewerCount={summary.viewerCount}
            avgDurationMs={summary.avgSessionMs}
            completionRate={summary.completionRate}
          />
        ) : (
          <EmptyState
            title="No analytics for this deck"
            description="This deck has not yet received viewer traffic. Analytics will populate once the event-ingest pipeline records sessions against it."
          />
        )}
        {hasSlides ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Slide breakdown
            </h2>
            <SlideBreakdownTable rows={[...slides]} />
          </section>
        ) : (
          <EmptyState
            title="No slide breakdown"
            description="Per-slide analytics will appear here once the warehouse has recorded viewer traffic for this deck."
          />
        )}
      </SuspenseBoundary>
    </div>
  );
}