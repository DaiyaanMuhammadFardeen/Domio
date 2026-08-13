/**
 * cohort-service — typed client for cohort retention + custom KPIs.
 *
 * Per Wave 7 §S7.3 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/cohorts` and `/v1/analytics/kpis` on the
 * warehouse. The cohort endpoint returns a per-join-week retention
 * matrix (rows = join-week, columns = week-N retention); the KPI
 * endpoint is a tiny CRUD surface for user-defined metric tiles.
 *
 * When the warehouse is unreachable both loaders return safe
 * defaults — never fabricated data. Callers render an empty state.
 */

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

// ---------------------------------------------------------------------------
// Cohort retention
// ---------------------------------------------------------------------------

export interface CohortRow {
  /** ISO week label for the cohort (e.g. "2025-W14"). */
  readonly joinWeek: string;
  /** Initial cohort size. */
  readonly size: number;
  /** Per-week-N retention rates in [0, 1]. `retention[0]` is week-1. */
  readonly retention: ReadonlyArray<number>;
}

export interface CohortMatrix {
  readonly rows: ReadonlyArray<CohortRow>;
  /** The number of trailing weeks in `retention[]` (matrix width). */
  readonly weeks: number;
}

export interface FetchCohortOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly weeks?: number;
  readonly baseUrl?: string;
}

/**
 * Fetch the cohort retention matrix for a workspace.
 *
 * Returns an empty matrix on any failure — the UI renders an
 * "no data" state in that case. The warehouse is expected to
 * return `{ matrix: { rows: CohortRow[], weeks: number } }`.
 */
export async function fetchCohortMatrix(
  workspaceId: string,
  opts: FetchCohortOpts = {},
): Promise<CohortMatrix> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/cohorts', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 12 * 7 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  if (typeof opts.weeks === 'number') url.searchParams.set('weeks', String(opts.weeks));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return { rows: [], weeks: opts.weeks ?? 8 };
    const json = (await res.json()) as {
      matrix?: { rows?: CohortRow[]; weeks?: number };
    };
    return {
      rows: json.matrix?.rows ?? [],
      weeks: json.matrix?.weeks ?? opts.weeks ?? 8,
    };
  } catch {
    return { rows: [], weeks: opts.weeks ?? 8 };
  }
}

// ---------------------------------------------------------------------------
// Custom KPIs
// ---------------------------------------------------------------------------

export type KpiAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'median';

/** The metric families the builder surfaces. */
export const KPI_METRICS = [
  'sessions',
  'viewers',
  'avg_dwell_ms',
  'completion_rate',
  'csat',
  'nps',
] as const satisfies readonly string[];

export type KpiMetric = (typeof KPI_METRICS)[number];

export interface KpiDefinition {
  readonly id: string;
  readonly title: string;
  readonly metric: KpiMetric;
  readonly aggregation: KpiAggregation;
  /** Optional deck/slide scope. Empty = workspace-wide. */
  readonly deckId?: string;
  readonly slideId?: string;
  /** Most recent computed value, if the warehouse has cached one. */
  readonly value?: number;
}

export interface SaveKpiInput {
  readonly title: string;
  readonly metric: KpiMetric;
  readonly aggregation: KpiAggregation;
  readonly deckId?: string;
  readonly slideId?: string;
}

export interface FetchKpisOpts {
  readonly baseUrl?: string;
}

/**
 * Fetch the saved KPI definitions for a workspace.
 *
 * Returns `[]` on any failure — the KPI builder renders an empty
 * tile grid in that case.
 */
export async function fetchKpis(
  workspaceId: string,
  opts: FetchKpisOpts = {},
): Promise<ReadonlyArray<KpiDefinition>> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/kpis', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { kpis?: KpiDefinition[] };
    return json.kpis ?? [];
  } catch {
    return [];
  }
}

/**
 * Save a new custom KPI. The warehouse returns the canonical
 * `KpiDefinition` (with assigned id and any server-computed
 * defaults). Throws on a non-2xx — callers render an error banner.
 */
export async function saveKpi(
  workspaceId: string,
  input: SaveKpiInput,
  opts: FetchKpisOpts = {},
): Promise<KpiDefinition> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/kpis', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`POST /v1/analytics/kpis → ${res.status}`);
  }
  const json = (await res.json()) as { kpi?: KpiDefinition };
  if (!json.kpi) {
    throw new Error('saveKpi: server response missing kpi payload');
  }
  return json.kpi;
}
