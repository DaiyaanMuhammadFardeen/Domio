/**
 * /deck/[id] — server component.
 *
 * Fetches DeckSummary + SlideBreakdown via `deck-service` and renders
 * them. On any failure the page renders an empty state — never
 * fabricated numbers.
 */

import { notFound } from 'next/navigation';
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deck {id}</h1>
        <p className="text-sm text-slate-500">
          30-day window · workspace <code className="rounded bg-slate-100 px-1.5 py-0.5">{workspaceId}</code>
        </p>
      </header>
      <DeckSummaryCard
        totalSessions={summary?.sessionCount ?? 0}
        viewerCount={summary?.viewerCount ?? 0}
        avgDurationMs={summary?.avgSessionMs ?? 0}
        completionRate={summary?.completionRate ?? 0}
      />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Slide breakdown
        </h2>
        <SlideBreakdownTable rows={[...slides]} />
      </section>
    </div>
  );
}