/**
 * freshness-service — typed client for the AI freshness checker.
 *
 * Per Wave 6 §S6.11 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Endpoints:
 *   POST /v1/ai/check-freshness        — scan deck for stale claims.
 *   POST /v1/ai/check-freshness/update — generate a replacement value.
 *
 * The service does not produce bootstrap mock findings; callers must
 * handle empty arrays explicitly.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreshnessKind = 'stat' | 'date' | 'quote' | 'figure';

export interface FreshnessClaim {
  readonly id: string;
  readonly slideId: string;
  readonly elementId: string;
  readonly text: string;
  readonly kind: FreshnessKind;
  /** ISO timestamp of the source material's age, if known. */
  readonly lastVerifiedAt: string | null;
  /** 0-100 score — lower is older. */
  readonly freshnessScore: number;
  /** Provenance reference (URL, dataset id, etc.). */
  readonly sourceRef: string | null;
}

export interface FreshnessReport {
  readonly claims: readonly FreshnessClaim[];
  readonly scannedAt: string;
}

export interface FreshnessUpdateRequest {
  readonly claimId: string;
  readonly instruction?: string;
}

export interface FreshnessUpdateResponse {
  readonly claimId: string;
  readonly replacement: string;
  /** Provenance for the new value. */
  readonly replacementSource: string | null;
  readonly rationale: string;
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
 * POST /v1/ai/check-freshness — scan a deck and return one chip per
 * stale claim with a freshness score.
 */
export function checkFreshness(
  deckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<FreshnessReport> {
  return postJson<FreshnessReport>(`${baseUrl}/v1/ai/check-freshness`, {
    deck_id: deckId,
  });
}

/**
 * POST /v1/ai/check-freshness/update — fetch a suggested replacement
 * for one claim. The caller applies or discards the replacement.
 */
export function suggestFreshnessUpdate(
  deckId: string,
  req: FreshnessUpdateRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<FreshnessUpdateResponse> {
  return postJson<FreshnessUpdateResponse>(`${baseUrl}/v1/ai/check-freshness/update`, {
    deck_id: deckId,
    ...req,
  });
}

// ---------------------------------------------------------------------------
// Helpers exposed to the UI
// ---------------------------------------------------------------------------

export function freshnessScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500/15 text-emerald-400';
  if (score >= 50) return 'bg-amber-500/15 text-amber-400';
  return 'bg-red-500/15 text-red-400';
}

export const KIND_LABEL: Record<FreshnessKind, string> = {
  stat: 'Statistic',
  date: 'Date',
  quote: 'Quote',
  figure: 'Figure',
};
