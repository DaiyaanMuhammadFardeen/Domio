/**
 * element-heatmap-service — typed client for element-level attention.
 *
 * Per Wave 7 §S7.4 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/heatmap/elements` on the warehouse. Each
 * "element" is a named region on a slide (chart, button, paragraph,
 * etc.). The element-level attention overlay is an attention total
 * per element; clicking an element fetches a time-series drill-in.
 *
 * Failure → empty / zero defaults. We never fabricate attention.
 */

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

/** What kind of element the slide preview is rendering. */
export type ElementKind = 'chart' | 'button' | 'text' | 'image' | 'table' | 'video';

export interface SlideElement {
  readonly id: string;
  readonly label: string;
  readonly kind: ElementKind;
  /** Normalized bounding box in slide-preview coordinates (0..1). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Attention rate in [0, 1] — fraction of dwell on this element. */
  readonly attention: number;
  /** Total attention time, ms. */
  readonly attentionMs: number;
}

export interface ElementHeatmap {
  readonly slideId: string;
  readonly deckId: string;
  readonly slideWidth: number;
  readonly slideHeight: number;
  readonly elements: ReadonlyArray<SlideElement>;
}

export interface ElementTimeSeriesPoint {
  /** ISO timestamp. */
  readonly t: string;
  readonly attention: number;
}

export interface FetchElementHeatmapOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly baseUrl?: string;
}

export interface FetchElementTimeSeriesOpts {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly baseUrl?: string;
}

/**
 * Fetch the element-level attention overlay for a slide.
 *
 * Returns an empty overlay on any failure. The renderer then draws
 * the slide preview with no overlay rectangles.
 */
export async function fetchElementHeatmap(
  workspaceId: string,
  deckId: string,
  slideId: string,
  opts: FetchElementHeatmapOpts = {},
): Promise<ElementHeatmap> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/heatmap/elements', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('deck_id', deckId);
  url.searchParams.set('slide_id', slideId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return {
        slideId,
        deckId,
        slideWidth: 960,
        slideHeight: 540,
        elements: [],
      };
    }
    const json = (await res.json()) as Partial<ElementHeatmap> & {
      elements?: SlideElement[];
    };
    return {
      slideId,
      deckId,
      slideWidth: json.slideWidth ?? 960,
      slideHeight: json.slideHeight ?? 540,
      elements: json.elements ?? [],
    };
  } catch {
    return {
      slideId,
      deckId,
      slideWidth: 960,
      slideHeight: 540,
      elements: [],
    };
  }
}

/**
 * Fetch the time-series drill-in for a single element.
 *
 * Returns an empty array on any failure. The drill-in chart
 * renders an empty axis in that case.
 */
export async function fetchElementTimeSeries(
  workspaceId: string,
  elementId: string,
  opts: FetchElementTimeSeriesOpts = {},
): Promise<ReadonlyArray<ElementTimeSeriesPoint>> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const url = new URL('/v1/analytics/heatmap/elements/timeseries', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('element_id', elementId);
  url.searchParams.set('from_ms', String(opts.fromMs ?? Date.now() - 14 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(opts.toMs ?? Date.now()));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { points?: ElementTimeSeriesPoint[] };
    return json.points ?? [];
  } catch {
    return [];
  }
}
