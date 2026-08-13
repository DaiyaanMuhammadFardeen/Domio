/**
 * sentiment-service — typed client for sentiment timeline + CSAT.
 *
 * Per Wave 7 §S7.5 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/sentiment` and `/v1/analytics/csat` on the
 * warehouse. The sentiment endpoint returns a per-slide timeline of
 * survey responses bucketed by day; the CSAT endpoint returns a
 * per-session/per-slide NPS-style breakdown.
 *
 * Failure → empty / zero defaults. We never fabricate sentiment.
 */

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

export interface SentimentPoint {
  /** ISO date, daily bucket. */
  readonly date: string;
  /** Mean sentiment in [-1, 1]. */
  readonly score: number;
  /** Number of responses that contributed to this bucket. */
  readonly responses: number;
}

export interface SentimentSeries {
  readonly slideId: string;
  /** Per-day sentiment points. */
  readonly points: ReadonlyArray<SentimentPoint>;
}

export interface FetchSentimentOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly baseUrl?: string;
}

/**
 * Fetch sentiment timeline(s) for a deck.
 *
 * Returns an empty series array on any failure — the timeline
 * renderer shows an "no data" state in that case.
 */
export async function fetchSentiment(
  workspaceId: string,
  deckId: string,
  opts: FetchSentimentOpts = {},
): Promise<ReadonlyArray<SentimentSeries>> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/sentiment', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('deck_id', deckId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 14 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      series?: SentimentSeries[];
    };
    return json.series ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CSAT / NPS
// ---------------------------------------------------------------------------

export type CsatAnswer = 'detractor' | 'passive' | 'promoter';

export interface CsatRow {
  readonly slideId: string;
  readonly sessionId?: string;
  readonly score: number; // 0..10
  readonly answer: CsatAnswer;
}

export interface CsatBreakdown {
  /** Aggregate counts across all sessions in the window. */
  readonly total: number;
  readonly promoter: number;
  readonly passive: number;
  readonly detractor: number;
  /** Net Promoter Score = %promoter − %detractor, rounded to int. */
  readonly nps: number;
  /** CSAT percentage (promoter + passive) ÷ total × 100. */
  readonly csatPct: number;
  /** Per-slide rollups so the dashboard can chart per-slide NPS. */
  readonly perSlide: ReadonlyArray<{
    slideId: string;
    nps: number;
    csatPct: number;
    count: number;
  }>;
  /** The raw rows, in case the caller wants the full breakdown. */
  readonly rows: ReadonlyArray<CsatRow>;
}

export interface FetchCsatOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly baseUrl?: string;
}

function classify(score: number): CsatAnswer {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

function rollup(rows: ReadonlyArray<CsatRow>): CsatBreakdown {
  if (rows.length === 0) {
    return {
      total: 0,
      promoter: 0,
      passive: 0,
      detractor: 0,
      nps: 0,
      csatPct: 0,
      perSlide: [],
      rows: [],
    };
  }
  let promoter = 0;
  let passive = 0;
  let detractor = 0;
  for (const r of rows) {
    if (r.answer === 'promoter') promoter += 1;
    else if (r.answer === 'passive') passive += 1;
    else detractor += 1;
  }
  const total = rows.length;
  const pctPromoter = (promoter / total) * 100;
  const pctDetractor = (detractor / total) * 100;
  const nps = Math.round(pctPromoter - pctDetractor);
  const csatPct = Math.round(((promoter + passive) / total) * 100);

  const slideBuckets = new Map<
    string,
    { promoter: number; passive: number; detractor: number; count: number }
  >();
  for (const r of rows) {
    const cur = slideBuckets.get(r.slideId) ?? { promoter: 0, passive: 0, detractor: 0, count: 0 };
    cur.count += 1;
    if (r.answer === 'promoter') cur.promoter += 1;
    else if (r.answer === 'passive') cur.passive += 1;
    else cur.detractor += 1;
    slideBuckets.set(r.slideId, cur);
  }
  const perSlide = [...slideBuckets.entries()].map(([slideId, b]) => {
    const p = (b.promoter / b.count) * 100;
    const d = (b.detractor / b.count) * 100;
    return {
      slideId,
      nps: Math.round(p - d),
      csatPct: Math.round(((b.promoter + b.passive) / b.count) * 100),
      count: b.count,
    };
  });

  return { total, promoter, passive, detractor, nps, csatPct, perSlide, rows };
}

/**
 * Fetch CSAT/NPS rows for a deck or a single slide.
 *
 * The client rolls up the raw `{ score, slideId }` rows the
 * warehouse returns into the NPS + per-slide breakdown the
 * dashboard renders. Missing rows → zero breakdown + empty state.
 */
export async function fetchCsat(
  workspaceId: string,
  opts: FetchCsatOpts & { deckId?: string; slideId?: string } = {},
): Promise<CsatBreakdown> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/csat', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  if (opts.deckId) url.searchParams.set('deck_id', opts.deckId);
  if (opts.slideId) url.searchParams.set('slide_id', opts.slideId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 30 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return rollup([]);
    const json = (await res.json()) as {
      rows?: Array<{ slideId?: string; sessionId?: string; score?: number }>;
    };
    const rows: CsatRow[] = (json.rows ?? [])
      .map((r) => {
        const score = Number(r.score ?? 0);
        return {
          slideId: String(r.slideId ?? ''),
          ...(r.sessionId ? { sessionId: String(r.sessionId) } : {}),
          score,
          answer: classify(score),
        };
      })
      .filter((r) => r.slideId !== '');
    return rollup(rows);
  } catch {
    return rollup([]);
  }
}

export { classify, rollup };
