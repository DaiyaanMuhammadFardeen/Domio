/**
 * funnel-service — typed client for the per-deck funnel report.
 *
 * Per Wave 7 §S7.2 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/funnel` on the warehouse. The funnel tracks
 *   viewers → opened → reached slide N → converted
 * with per-slide bounce + an AI "why?" hypothesis endpoint.
 *
 * On any failure the loader returns an empty payload. The page
 * renders an empty state — never fabricated funnel numbers.
 */

import { fetcher } from './fetcher';

export interface FunnelStep {
  readonly label: string;
  readonly value: number;
}

export interface SlideBreakdown {
  readonly slideId: string;
  readonly index: number;
  readonly title: string | null;
  readonly viewers: number;
  readonly bounceRate: number;
  readonly avgDwellMs: number;
}

export interface WeeklyCohort {
  /** ISO date for the start of the week (Monday). */
  readonly weekStart: string;
  readonly viewers: number;
  readonly conversions: number;
}

export interface WhyHypothesis {
  readonly slideId: string;
  readonly summary: string;
  /** Bullet points of likely explanations. */
  readonly hypotheses: ReadonlyArray<string>;
}

export interface FunnelReport {
  readonly deckId: string;
  readonly workspaceId: string;
  readonly steps: ReadonlyArray<FunnelStep>;
  readonly slides: ReadonlyArray<SlideBreakdown>;
  readonly weeklyCohort: ReadonlyArray<WeeklyCohort>;
}

interface FunnelStepWire {
  label?: string;
  value?: number;
}

interface SlideBreakdownWire {
  slide_id?: string;
  index?: number;
  title?: string | null;
  viewers?: number;
  bounce_rate?: number;
  avg_dwell_ms?: number;
}

interface WeeklyCohortWire {
  week_start?: string;
  viewers?: number;
  conversions?: number;
}

interface FunnelReportWire {
  deck_id?: string;
  workspace_id?: string;
  steps?: FunnelStepWire[];
  slides?: SlideBreakdownWire[];
  weekly_cohort?: WeeklyCohortWire[];
}

interface WhyHypothesisWire {
  slide_id?: string;
  summary?: string;
  hypotheses?: string[];
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

/**
 * Fetch the per-deck funnel report for a workspace.
 *
 * Returns null when the upstream is unreachable or the deck is
 * missing — the page renders an empty state.
 */
export async function fetchFunnelReport(
  workspaceId: string,
  deckId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<FunnelReport | null> {
  try {
    const json = await fetcher<FunnelReportWire>(baseUrl, `/v1/analytics/funnel`, { workspaceId });
    return {
      deckId: String(json.deck_id ?? deckId),
      workspaceId: String(json.workspace_id ?? workspaceId),
      steps: (json.steps ?? []).map((s) => ({
        label: String(s.label ?? ''),
        value: Number(s.value ?? 0),
      })),
      slides: (json.slides ?? []).map((s, i) => ({
        slideId: String(s.slide_id ?? ''),
        index: Number(s.index ?? i),
        title: s.title == null ? null : String(s.title),
        viewers: Number(s.viewers ?? 0),
        bounceRate: Number(s.bounce_rate ?? 0),
        avgDwellMs: Number(s.avg_dwell_ms ?? 0),
      })),
      weeklyCohort: (json.weekly_cohort ?? []).map((w) => ({
        weekStart: String(w.week_start ?? ''),
        viewers: Number(w.viewers ?? 0),
        conversions: Number(w.conversions ?? 0),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch AI-suggested "why?" hypotheses for a high-bounce slide.
 *
 * Returns `null` when the upstream is unreachable. The UI shows an
 * empty state — never fabricated hypotheses.
 */
export async function fetchWhyHypotheses(
  workspaceId: string,
  deckId: string,
  slideId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<WhyHypothesis | null> {
  try {
    const json = await fetcher<WhyHypothesisWire>(baseUrl, `/v1/analytics/funnel/why`, {
      workspaceId,
      method: 'POST',
      body: { deck_id: deckId, slide_id: slideId },
    });
    return {
      slideId: String(json.slide_id ?? slideId),
      summary: String(json.summary ?? ''),
      hypotheses: Array.isArray(json.hypotheses) ? [...json.hypotheses] : [],
    };
  } catch {
    return null;
  }
}
