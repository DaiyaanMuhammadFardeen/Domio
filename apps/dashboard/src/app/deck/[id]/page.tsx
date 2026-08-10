/**
 * /deck/[id] — server component.
 *
 * Fetches DeckSummary + SlideBreakdown from the warehouse REST
 * endpoints and renders them. Falls back to empty arrays if the
 * warehouse isn't running so the page still renders.
 */

import { notFound } from 'next/navigation';
import { DeckSummaryCard } from './DeckSummaryCard';
import {
  SlideBreakdownTable,
  type SlideRow,
} from './SlideBreakdownTable';

const WAREHOUSE_URL = process.env['WAREHOUSE_URL'] ?? 'http://localhost:8088';

interface DeckSummaryRow {
  workspaceId: string;
  deckId: string;
  sessionCount: number;
  viewerCount: number;
  totalEvents: number;
  avgSessionMs: number;
  completionRate: number;
}

async function fetchDeckSummary(
  workspaceId: string,
  deckId: string,
): Promise<DeckSummaryRow | null> {
  const url = new URL('/v1/decks/summary', WAREHOUSE_URL);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('deck_id', deckId);
  url.searchParams.set('from_ms', String(Date.now() - 30 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { rows: Record<string, unknown>[] };
    const r = json.rows?.[0];
    if (!r) return null;
    // Warehouse returns snake_case; map to the camelCase shape DeckSummaryCard expects.
    return {
      workspaceId: String(r['workspace_id'] ?? ''),
      deckId: String(r['deck_id'] ?? ''),
      sessionCount: Number(r['session_count'] ?? 0),
      viewerCount: Number(r['viewer_count'] ?? 0),
      totalEvents: Number(r['total_events'] ?? 0),
      avgSessionMs: Number(r['avg_session_ms'] ?? 0),
      completionRate: Number(r['completion_rate'] ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchSlideBreakdown(
  workspaceId: string,
  deckId: string,
): Promise<SlideRow[]> {
  const url = new URL(`/v1/decks/${encodeURIComponent(deckId)}/slides`, WAREHOUSE_URL);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(Date.now() - 30 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { rows: Record<string, unknown>[] };
    return (json.rows ?? []).map((r) => ({
      slideId: String(r['slide_id'] ?? ''),
      views: Number(r['views'] ?? 0),
      uniqueViewers: Number(r['unique_viewers'] ?? 0),
      avgDwellMs: Number(r['avg_dwell_ms'] ?? 0),
      bounceRate: Number(r['bounce_rate'] ?? 0),
    }));
  } catch {
    return [];
  }
}

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
        <SlideBreakdownTable rows={slides} />
      </section>
    </div>
  );
}