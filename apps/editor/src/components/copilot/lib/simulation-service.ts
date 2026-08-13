/**
 * simulation-service — typed client for confidence surfacing + the
 * audience-simulation orchestrator.
 *
 * Per Wave 6 §S6.12 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Endpoints:
 *   POST /v1/ai/simulation — run a persona simulation against a deck
 *     and return an engagement heatmap (per-slide scores).
 *
 * Confidence is a per-claim surface; the orchestrator returns it as
 * part of the freshness / simulation report so the editor doesn't need
 * a dedicated endpoint. We still expose a small typed helper to look
 * up the score + provenance for a given claim so the
 * `<ConfidenceBadge>` can re-use the same shape across surfaces.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Persona presets
// ---------------------------------------------------------------------------

export type PersonaId = 'exec' | 'analyst' | 'skeptic';

export interface Persona {
  readonly id: PersonaId;
  readonly label: string;
  readonly description: string;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'exec',
    label: 'Executive',
    description: 'Time-poor, outcome-focused. Skims bullet points.',
  },
  {
    id: 'analyst',
    label: 'Analyst',
    description: 'Reads every footnote. Wants source citations.',
  },
  {
    id: 'skeptic',
    label: 'Skeptic',
    description: 'Looks for contradictions. Pushes back on vague claims.',
  },
];

// ---------------------------------------------------------------------------
// Simulation request / response
// ---------------------------------------------------------------------------

export interface SimulationRequest {
  readonly deckId: string;
  readonly persona: PersonaId;
  /** Optional numeric tweaks (slider values for what-if). */
  readonly params?: Readonly<Record<string, number>>;
}

export interface SlideEngagement {
  readonly slideId: string;
  readonly slideIndex: number;
  /** 0-100. */
  readonly engagement: number;
  /** 0-100. */
  readonly comprehension: number;
  /** Issues the persona flagged. */
  readonly flags: readonly string[];
}

export interface SimulationResponse {
  readonly persona: PersonaId;
  readonly deckId: string;
  readonly slides: readonly SlideEngagement[];
  /** Overall engagement score across the deck. */
  readonly overallEngagement: number;
}

// ---------------------------------------------------------------------------
// Confidence (used by ConfidenceBadge)
// ---------------------------------------------------------------------------

export interface ConfidenceRecord {
  readonly claimId: string;
  /** 0-100. */
  readonly score: number;
  readonly provenance: string | null;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postJson<T>(url: string, body: unknown): Promise<T> {
  // The copilot services are themselves the typed HTTP layer — they
  // wrap each `/v1/ai/*` endpoint with a typed signature, so this
  // `fetch` is the network boundary, not a stray view-level call.
  // eslint-disable-next-line domio/no-raw-fetch
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * POST /v1/ai/simulation — run a persona simulation against a deck.
 */
export function runSimulation(
  req: SimulationRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<SimulationResponse> {
  return postJson<SimulationResponse>(`${baseUrl}/v1/ai/simulation`, req);
}

/**
 * Heatmap color helper used by the engagement panel.
 *
 * 0-40 red, 40-70 amber, 70-100 emerald.
 */
export function engagementColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

/**
 * Heatmap intensity helper — used to scale a bar's fill width.
 */
export function intensityClass(score: number): string {
  if (score >= 85) return 'opacity-100';
  if (score >= 70) return 'opacity-80';
  if (score >= 50) return 'opacity-60';
  if (score >= 30) return 'opacity-40';
  return 'opacity-25';
}

// ---------------------------------------------------------------------------
// Confidence badge helpers
// ---------------------------------------------------------------------------

/**
 * Pick a confidence bucket label.
 */
export function confidenceLabel(score: number): string {
  if (score >= 85) return 'High';
  if (score >= 60) return 'Medium';
  if (score >= 30) return 'Low';
  return 'Inferential';
}

/**
 * Pick a tailwind background+text pair for the badge.
 */
export function confidenceColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500/15 text-emerald-400';
  if (score >= 60) return 'bg-amber-500/15 text-amber-400';
  if (score >= 30) return 'bg-red-500/15 text-red-400';
  return 'bg-slate-500/15 text-slate-400';
}
