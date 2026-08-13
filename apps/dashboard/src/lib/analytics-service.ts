/**
 * analytics-service — typed client for the dashboard's overview +
 * deck-summary endpoints.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps the warehouse REST endpoints:
 *   GET /v1/analytics/overview → workspace-level KPIs
 *   GET /v1/analytics/decks    → list of decks (rows) for a workspace
 *   GET /v1/analytics/decks/{id} → summary for one deck
 *
 * On any failure the loader returns zeros / an empty list — never
 * fabricated numbers.
 */

import { fetcher } from './fetcher';

export interface OverviewKpis {
  readonly sessions: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly viewers: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly avgDwellMs: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly completionRate: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
}

export interface DeckSummaryRow {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly sessionCount: number;
  readonly viewerCount: number;
  readonly totalEvents: number;
  readonly avgSessionMs: number;
  readonly completionRate: number;
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ?? 'http://localhost:8088';

const EMPTY_KPIS: OverviewKpis = {
  sessions: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  viewers: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  avgDwellMs: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  completionRate: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
};

interface OverviewWire {
  sessions?: number | null;
  viewers?: number | null;
  avg_dwell_ms?: number | null;
  completion_rate?: number | null;
  sessions_delta?: number | null;
  viewers_delta?: number | null;
  avg_dwell_delta?: number | null;
  completion_delta?: number | null;
  sessions_series?: readonly number[] | null;
  viewers_series?: readonly number[] | null;
  avg_dwell_series?: readonly number[] | null;
  completion_series?: readonly number[] | null;
}

const SEVEN_ZEROS = [0, 0, 0, 0, 0, 0, 0] as const;

/**
 * Fetch the overview KPIs for a workspace from the warehouse.
 *
 * On any failure (network error, non-2xx, malformed body) the loader
 * returns `EMPTY_KPIS`. The caller renders zeros in that case — never
 * synthetic data.
 */
export async function fetchOverviewKpis(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<OverviewKpis> {
  try {
    const json = await fetcher<OverviewWire>(baseUrl, '/v1/analytics/overview', { workspaceId });
    return {
      sessions: {
        value: Number(json.sessions ?? 0),
        delta: Number(json.sessions_delta ?? 0),
        series: Array.isArray(json.sessions_series) ? [...json.sessions_series] : [...SEVEN_ZEROS],
      },
      viewers: {
        value: Number(json.viewers ?? 0),
        delta: Number(json.viewers_delta ?? 0),
        series: Array.isArray(json.viewers_series) ? [...json.viewers_series] : [...SEVEN_ZEROS],
      },
      avgDwellMs: {
        value: Number(json.avg_dwell_ms ?? 0),
        delta: Number(json.avg_dwell_delta ?? 0),
        series: Array.isArray(json.avg_dwell_series) ? [...json.avg_dwell_series] : [...SEVEN_ZEROS],
      },
      completionRate: {
        value: Number(json.completion_rate ?? 0),
        delta: Number(json.completion_delta ?? 0),
        series: Array.isArray(json.completion_series) ? [...json.completion_series] : [...SEVEN_ZEROS],
      },
    };
  } catch {
    return EMPTY_KPIS;
  }
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
  try {
    const json = await fetcher<{ decks?: DeckSummaryWire[] }>(baseUrl, '/v1/analytics/decks', {
      workspaceId,
    });
    return (json.decks ?? []).map(mapDeckRow);
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
  try {
    const json = await fetcher<{ deck?: DeckSummaryWire | null }>(
      baseUrl,
      `/v1/analytics/decks/${encodeURIComponent(deckId)}`,
      { workspaceId },
    );
    if (!json.deck) return null;
    return mapDeckRow(json.deck);
  } catch {
    return null;
  }
}

interface DeckSummaryWire {
  workspace_id?: string;
  deck_id?: string;
  session_count?: number;
  viewer_count?: number;
  total_events?: number;
  avg_session_ms?: number;
  completion_rate?: number;
}

function mapDeckRow(raw: DeckSummaryWire): DeckSummaryRow {
  return {
    workspaceId: String(raw.workspace_id ?? ''),
    deckId: String(raw.deck_id ?? ''),
    sessionCount: Number(raw.session_count ?? 0),
    viewerCount: Number(raw.viewer_count ?? 0),
    totalEvents: Number(raw.total_events ?? 0),
    avgSessionMs: Number(raw.avg_session_ms ?? 0),
    completionRate: Number(raw.completion_rate ?? 0),
  };
}
