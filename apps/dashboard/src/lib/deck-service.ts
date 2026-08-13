/**
 * deck-service — typed client for per-deck slide breakdown.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps the warehouse REST endpoint:
 *   GET /v1/analytics/decks/{deckId}/slides → per-slide breakdown
 *
 * The deck *summary* row + deck *list* are sourced from
 * analytics-service (also under /v1/analytics/*). This module
 * keeps `fetchSlideBreakdown` so deck/[id] can render its
 * breakdown.
 *
 * On any failure the loader returns an empty list / null so the
 * page renders an empty state — never fabricated numbers.
 */

import { fetcher } from './fetcher';

export type { DeckSummaryRow } from './analytics-service.js';
export { fetchDecks, fetchDeckSummary } from './analytics-service.js';

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

interface SlideWire {
  slide_id?: string;
  views?: number;
  unique_viewers?: number;
  avg_dwell_ms?: number;
  bounce_rate?: number;
}

function mapSlideRow(raw: SlideWire): SlideBreakdownRow {
  return {
    slideId: String(raw.slide_id ?? ''),
    views: Number(raw.views ?? 0),
    uniqueViewers: Number(raw.unique_viewers ?? 0),
    avgDwellMs: Number(raw.avg_dwell_ms ?? 0),
    bounceRate: Number(raw.bounce_rate ?? 0),
  };
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
  try {
    const json = await fetcher<{ slides?: SlideWire[] }>(
      baseUrl,
      `/v1/analytics/decks/${encodeURIComponent(deckId)}/slides`,
      { workspaceId },
    );
    return (json.slides ?? []).map(mapSlideRow);
  } catch {
    return [];
  }
}
