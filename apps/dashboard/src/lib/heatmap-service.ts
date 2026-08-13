/**
 * heatmap-service — typed client for the heatmap tile endpoint.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps `/v1/decks/{deckId}/slides/{slideId}/heatmap` on the
 * warehouse. When the warehouse is unreachable the loader returns
 * an empty array — the heatmap canvas then renders transparent.
 */

export interface HeatmapCell {
  readonly x: number;
  readonly y: number;
  readonly intensity: number;
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

export interface FetchHeatmapOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly baseUrl?: string;
}

/**
 * Fetch the heatmap tile cells for a slide.
 *
 * Returns an empty array on any failure. The caller renders an
 * empty grid in that case — never synthetic intensity data.
 */
export async function fetchHeatmap(
  workspaceId: string,
  deckId: string,
  slideId: string,
  opts: FetchHeatmapOpts = {},
): Promise<ReadonlyArray<HeatmapCell>> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL(
    `/v1/decks/${encodeURIComponent(deckId)}/slides/${encodeURIComponent(slideId)}/heatmap`,
    baseUrl,
  );
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { tile?: { cells?: HeatmapCell[] } };
    return json.tile?.cells ?? [];
  } catch {
    return [];
  }
}
