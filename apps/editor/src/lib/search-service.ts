/**
 * Search service — typed clients for semantic search + chart recommendation.
 *
 * Per Wave 6 §S6.10 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Wraps:
 *  - `POST /v1/ai/search/slides` for semantic slide search across the workspace.
 *  - `POST /v1/ai/chart/recommend` for chart-type recommendations for a
 *    selected data element.
 *
 * Each endpoint has a deterministic bootstrap fallback so the editor
 * stays usable when the backend is offline.
 */

const DEFAULT_API_BASE = 'http://localhost:8080';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// ─── Semantic slide search ───────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'table';

export interface SemanticSearchRequest {
  query: string;
  /** Optional workspace id; helps scope the search. */
  workspaceId?: string;
  /** Max results to return. */
  limit?: number;
}

export interface SemanticSearchResult {
  /** ID of the matching slide. */
  readonly slideId: string;
  /** ID of the deck the slide belongs to. */
  readonly deckId: string;
  /** Deck title for display. */
  readonly deckTitle: string;
  /** Slide title (or first heading). */
  readonly slideTitle: string;
  /** Snippet of the matching content (post-truncation). */
  readonly snippet: string;
  /** Optional thumbnail URL. */
  readonly thumbnailUrl?: string;
  /** Relevance score in [0,1]. */
  readonly score: number;
}

export interface SemanticSearchResponse {
  readonly query: string;
  readonly results: ReadonlyArray<SemanticSearchResult>;
  /** Total match count (may exceed `results.length` if capped). */
  readonly total: number;
}

/**
 * Run a semantic search across the user's workspace and return ranked
 * slide matches. Falls back to a deterministic set of synthetic results
 * when offline.
 */
export async function searchSlides(
  req: SemanticSearchRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<SemanticSearchResponse> {
  try {
    return await postJson<SemanticSearchResponse>(`${baseUrl}/v1/ai/search/slides`, {
      query: req.query,
      workspaceId: req.workspaceId ?? 'default',
      limit: req.limit ?? 20,
    });
  } catch {
    return bootstrapSearchResults(req.query, req.limit ?? 20);
  }
}

function bootstrapSearchResults(query: string, limit: number): SemanticSearchResponse {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query, results: [], total: 0 };
  }
  const seed = hashSeed(trimmed);
  const topics = topicsFromQuery(trimmed);
  const results: SemanticSearchResult[] = [];
  const count = Math.min(limit, Math.max(1, topics.length));
  for (let i = 0; i < count; i += 1) {
    const score = Math.max(0.4, 0.95 - i * 0.12 - (seed % 5) / 100);
    results.push({
      slideId: `slide-${seed}-${i}`,
      deckId: `deck-${seed}-${i}`,
      deckTitle: `${capitalize(topics[i]!)} overview`,
      slideTitle: `${capitalize(topics[i]!)} — slide ${i + 1}`,
      snippet: `Notes covering ${topics[i]} and how it relates to "${trimmed}".`,
      score,
    });
  }
  return { query, results, total: results.length };
}

function topicsFromQuery(query: string): readonly string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2);
  if (words.length === 0) return ['topic'];
  const seed = hashSeed(words.join(' '));
  const fallback = ['pricing', 'onboarding', 'roadmap', 'metrics', 'growth', 'integration', 'compliance', 'support'];
  const out = [...words];
  for (let i = 0; i < 4; i += 1) {
    out.push(fallback[(seed + i) % fallback.length]!);
  }
  return out;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

// ─── Chart recommendation ────────────────────────────────────────────────────

export interface ChartRecommendRequest {
  /** Element id of the selected data binding, if any. */
  dataElementId?: string;
  /** Inline preview of the data (headers + sample rows). */
  dataPreview?: {
    columns: ReadonlyArray<string>;
    rows: ReadonlyArray<ReadonlyArray<string | number>>;
  };
}

export interface ChartRecommendation {
  readonly chartType: ChartType;
  /** 0..1 confidence in the recommendation. */
  readonly confidence: number;
  /** Human-readable rationale explaining why this chart fits. */
  readonly rationale: string;
}

export interface ChartRecommendResponse {
  readonly recommendations: ReadonlyArray<ChartRecommendation>;
  /** Source element id echoed back. */
  readonly dataElementId?: string;
}

/**
 * Ask the AI service to recommend chart types for the selected data
 * element. Always returns exactly 3 options (ranked high→low) when
 * offline.
 */
export async function recommendCharts(
  req: ChartRecommendRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ChartRecommendResponse> {
  try {
    return await postJson<ChartRecommendResponse>(`${baseUrl}/v1/ai/chart/recommend`, req);
  } catch {
    return bootstrapChartRecs(req);
  }
}

function bootstrapChartRecs(req: ChartRecommendRequest): ChartRecommendResponse {
  const cols = req.dataPreview?.columns ?? [];
  const numeric = cols.filter((c) => /price|count|amount|total|rate|score|number/i.test(c));
  const categorical = cols.filter((c) => !numeric.includes(c));
  const recs: ChartRecommendation[] = [];

  if (numeric.length >= 1 && categorical.length >= 1) {
    recs.push({
      chartType: 'bar',
      confidence: 0.91,
      rationale: 'Compare categorical groups across a numeric metric — bar charts surface rank order at a glance.',
    });
    recs.push({
      chartType: 'line',
      confidence: 0.78,
      rationale: 'Trend over time (or ordered categories); best when the x-axis has a meaningful sequence.',
    });
    recs.push({
      chartType: 'scatter',
      confidence: 0.55,
      rationale: 'Reveal correlation between two numeric dimensions; less effective with few points.',
    });
  } else if (numeric.length >= 1) {
    recs.push({
      chartType: 'line',
      confidence: 0.88,
      rationale: 'Single numeric series reads best as a line — emphasises change across the index.',
    });
    recs.push({
      chartType: 'bar',
      confidence: 0.74,
      rationale: 'Bar is a clean fallback when the audience expects discrete comparisons.',
    });
    recs.push({
      chartType: 'area',
      confidence: 0.6,
      rationale: 'Filled area emphasises magnitude; use sparingly to avoid distorting perception.',
    });
  } else {
    recs.push({
      chartType: 'pie',
      confidence: 0.72,
      rationale: 'Show share-of-total across categorical dimensions; cap at 5–6 slices for legibility.',
    });
    recs.push({
      chartType: 'bar',
      confidence: 0.65,
      rationale: 'Bar chart is the safer default when category counts are uneven.',
    });
    recs.push({
      chartType: 'table',
      confidence: 0.5,
      rationale: 'When precision matters more than visual storytelling, expose the raw numbers.',
    });
  }
  return {
    recommendations: recs.slice(0, 3),
    ...(req.dataElementId ? { dataElementId: req.dataElementId } : {}),
  };
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}