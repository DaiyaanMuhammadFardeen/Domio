/**
 * diff-service — typed client for the deck-lint + deck-diff surface.
 *
 * Per Wave 6 §S6.13 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Endpoints:
 *   POST /v1/diff/deck  — diff two deck versions.
 *   POST /v1/lint/deck  — scan a deck for agent-facing lint violations
 *     (broken data bindings, orphaned components, off-brand colors,
 *     a11y issues).
 *
 * Each fix endpoint produces a small patch the UI can preview.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Deck diff
// ---------------------------------------------------------------------------

export type DiffKind = 'added' | 'removed' | 'changed';

export type ElementKind =
  | 'slide'
  | 'text'
  | 'shape'
  | 'image'
  | 'chart'
  | 'data-binding'
  | 'variable'
  | 'theme';

export interface DeckDiffEntry {
  readonly id: string;
  readonly kind: ElementKind;
  readonly slideIndex: number | null;
  /** Field path within the element, e.g. "fill", "data.series[0].value". */
  readonly path: string | null;
  readonly before: unknown;
  readonly after: unknown;
  /** Diff classification. */
  readonly diff: DiffKind;
}

export interface DeckDiffRequest {
  readonly deckIdA: string;
  readonly deckIdB: string;
}

export interface DeckDiffResponse {
  readonly deckIdA: string;
  readonly deckIdB: string;
  readonly entries: readonly DeckDiffEntry[];
}

// ---------------------------------------------------------------------------
// Deck lint
// ---------------------------------------------------------------------------

export type LintViolationKind =
  | 'broken-data-binding'
  | 'orphaned-component'
  | 'off-brand-color'
  | 'accessibility'
  | 'missing-source';

export interface LintViolation {
  readonly id: string;
  readonly kind: LintViolationKind;
  readonly slideId: string | null;
  readonly elementId: string | null;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface LintFixResponse {
  readonly violationId: string;
  readonly patch: ReadonlyArray<LintFixOp>;
  readonly before: string;
  readonly after: string;
}

export type LintFixOp =
  | { readonly op: 'set-binding'; readonly elementId: string; readonly sourceId: string }
  | { readonly op: 'remove-element'; readonly elementId: string }
  | { readonly op: 'set-color'; readonly elementId: string; readonly token: string }
  | { readonly op: 'set-aria'; readonly elementId: string; readonly ariaLabel: string };

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
 * POST /v1/diff/deck — diff two deck versions and return every
 * added/removed/changed element.
 */
export function diffDeck(
  req: DeckDiffRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<DeckDiffResponse> {
  return postJson<DeckDiffResponse>(`${baseUrl}/v1/diff/deck`, req);
}

/**
 * POST /v1/lint/deck — scan a deck for lint violations.
 */
export function lintDeck(
  deckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<{ readonly violations: readonly LintViolation[] }> {
  return postJson<{ readonly violations: readonly LintViolation[] }>(
    `${baseUrl}/v1/lint/deck`,
    { deck_id: deckId },
  );
}

/**
 * POST /v1/lint/deck/fix — generate a patch preview for one violation.
 */
export function fixLintViolation(
  deckId: string,
  violationId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LintFixResponse> {
  return postJson<LintFixResponse>(
    `${baseUrl}/v1/lint/deck/fix`,
    { deck_id: deckId, violation_id: violationId },
  );
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export const VIOLATION_LABEL: Record<LintViolationKind, string> = {
  'broken-data-binding': 'Broken data binding',
  'orphaned-component': 'Orphaned component',
  'off-brand-color': 'Off-brand color',
  'accessibility': 'Accessibility',
  'missing-source': 'Missing source',
};

/**
 * Group diff entries by `diff` classification so the panel can render
 * three sections (added / removed / changed) without re-sorting.
 */
export function groupByDiff(
  entries: readonly DeckDiffEntry[],
): { readonly added: readonly DeckDiffEntry[]; readonly removed: readonly DeckDiffEntry[]; readonly changed: readonly DeckDiffEntry[] } {
  const added: DeckDiffEntry[] = [];
  const removed: DeckDiffEntry[] = [];
  const changed: DeckDiffEntry[] = [];
  for (const e of entries) {
    if (e.diff === 'added') added.push(e);
    else if (e.diff === 'removed') removed.push(e);
    else changed.push(e);
  }
  return { added, removed, changed };
}

/**
 * Pick a tailwind border color for a diff highlight based on the
 * classification.
 */
export function diffBorderClass(diff: DiffKind): string {
  switch (diff) {
    case 'added': return 'border-emerald-500/60';
    case 'removed': return 'border-red-500/60';
    case 'changed': return 'border-amber-500/60';
  }
}

/**
 * Pick a label for a diff classification.
 */
export const DIFF_LABEL: Record<DiffKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};