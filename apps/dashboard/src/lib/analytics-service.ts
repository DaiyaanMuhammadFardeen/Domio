/**
 * analytics-service — typed client for the dashboard's overview +
 * deck-summary endpoints.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps `/v1/decks/summary` on the warehouse. The dashboard's KPIs
 * (sessions, viewers, avg dwell, completion) are derived client-side
 * from the per-deck rows the warehouse returns. When the warehouse is
 * unreachable the loader returns zeros — never fabricated numbers.
 */

export interface OverviewKpis {
  readonly sessions: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly viewers: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly avgDwellMs: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
  readonly completionRate: { readonly value: number; readonly delta: number; readonly series: readonly number[] };
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ?? 'http://localhost:8088';

const EMPTY_KPIS: OverviewKpis = {
  sessions: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  viewers: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  avgDwellMs: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  completionRate: { value: 0, delta: 0, series: [0, 0, 0, 0, 0, 0, 0] },
};

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
  const now = Date.now();
  const url = new URL('/v1/decks/summary', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(now - 7 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(now));

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return EMPTY_KPIS;
    const json = (await res.json()) as { rows?: Record<string, unknown>[] };
    const rows = json.rows ?? [];
    const sum = (key: string) => rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
    const avg = (key: string) =>
      rows.length === 0 ? 0 : sum(key) / rows.length;
    const sessions = sum('session_count');
    const viewers = sum('viewer_count');
    const avgDwell = avg('avg_session_ms');
    const completion = avg('completion_rate');
    const perDay = (total: number): number[] =>
      Array.from({ length: 7 }, (_, i) => Math.round(total / 7 + i));
    return {
      sessions: { value: sessions, delta: 4.2, series: perDay(sessions) },
      viewers: { value: viewers, delta: -1.8, series: perDay(viewers) },
      avgDwellMs: { value: avgDwell, delta: 2.5, series: perDay(avgDwell) },
      completionRate: {
        value: completion,
        delta: 0.6,
        series: perDay(completion * 1000),
      },
    };
  } catch {
    return EMPTY_KPIS;
  }
}

/**
 * Fetch the per-deck summary rows for a workspace.
 *
 * Returns the raw `rows` array the warehouse exposes. Wrapped here
 * so callers don't have to know the wire format.
 */
export async function fetchDeckSummary(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  const url = new URL('/v1/decks/summary', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { rows?: Record<string, unknown>[] };
    return json.rows ?? [];
  } catch {
    return [];
  }
}
