/**
 * deck-service — typed client for the deck summary + slide breakdown.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps the warehouse REST endpoints:
 *   GET /v1/decks/summary          → list of decks (rows) for a workspace
 *   GET /v1/decks/{deckId}/slides  → per-slide breakdown rows
 *
 * On any failure the loader returns an empty list / null so the page
 * renders an empty state — never fabricated numbers.
 */

export interface DeckSummaryRow {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly sessionCount: number;
  readonly viewerCount: number;
  readonly totalEvents: number;
  readonly avgSessionMs: number;
  readonly completionRate: number;
}

export interface SlideBreakdownRow extends Record<string, unknown> {
  readonly slideId: string;
  readonly views: number;
  readonly uniqueViewers: number;
  readonly avgDwellMs: number;
  readonly bounceRate: number;
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

const SUMMARY_WINDOW_DAYS = 30;
const summaryWindowMs = () => Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function mapDeckRow(raw: Record<string, unknown>): DeckSummaryRow {
  return {
    workspaceId: String(raw['workspace_id'] ?? ''),
    deckId: String(raw['deck_id'] ?? ''),
    sessionCount: Number(raw['session_count'] ?? 0),
    viewerCount: Number(raw['viewer_count'] ?? 0),
    totalEvents: Number(raw['total_events'] ?? 0),
    avgSessionMs: Number(raw['avg_session_ms'] ?? 0),
    completionRate: Number(raw['completion_rate'] ?? 0),
  };
}

function mapSlideRow(raw: Record<string, unknown>): SlideBreakdownRow {
  return {
    slideId: String(raw['slide_id'] ?? ''),
    views: Number(raw['views'] ?? 0),
    uniqueViewers: Number(raw['unique_viewers'] ?? 0),
    avgDwellMs: Number(raw['avg_dwell_ms'] ?? 0),
    bounceRate: Number(raw['bounce_rate'] ?? 0),
  };
}

/**
 * Fetch the list of decks for a workspace.
 *
 * Returns an empty array on any failure.
 */
export async function fetchDecks(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<DeckSummaryRow>> {
  const now = Date.now();
  const url = new URL('/v1/decks/summary', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(summaryWindowMs()));
  url.searchParams.set('to_ms', String(now));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { rows?: Record<string, unknown>[] };
    return (json.rows ?? []).map(mapDeckRow);
  } catch {
    return [];
  }
}

/**
 * Fetch the summary for a single deck.
 *
 * Returns null if the warehouse is unreachable or the deck is not found.
 */
export async function fetchDeckSummary(
  workspaceId: string,
  deckId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<DeckSummaryRow | null> {
  const now = Date.now();
  const url = new URL('/v1/decks/summary', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('deck_id', deckId);
  url.searchParams.set('from_ms', String(summaryWindowMs()));
  url.searchParams.set('to_ms', String(now));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { rows?: Record<string, unknown>[] };
    const first = json.rows?.[0];
    if (!first) return null;
    return mapDeckRow(first);
  } catch {
    return null;
  }
}

/**
 * Fetch the per-slide breakdown for a deck.
 *
 * Returns an empty array on any failure.
 */
export async function fetchSlideBreakdown(
  workspaceId: string,
  deckId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<SlideBreakdownRow>> {
  const now = Date.now();
  const url = new URL(`/v1/decks/${encodeURIComponent(deckId)}/slides`, baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(summaryWindowMs()));
  url.searchParams.set('to_ms', String(now));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { rows?: Record<string, unknown>[] };
    return (json.rows ?? []).map(mapSlideRow);
  } catch {
    return [];
  }
}
