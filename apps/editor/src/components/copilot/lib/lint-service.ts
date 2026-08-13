/**
 * lint-service — typed client for layout-repair and accessibility-audit
 * endpoints exposed by the AI orchestrator.
 *
 * Per Wave 6 §S6.9 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Endpoints:
 *   POST /v1/ai/lint-layout          — scan deck for layout problems.
 *   POST /v1/ai/lint-layout/fix      — generate a patch for one issue.
 *   POST /v1/ai/accessibility-audit  — scan deck for a11y problems.
 *   POST /v1/ai/accessibility-audit/fix — generate a patch for one issue.
 *
 * All four are POST + JSON. They return small typed envelopes. When the
 * backend is unreachable the helpers throw — the UI surfaces the error
 * inline. Bootstrap-mode fake findings are intentionally not produced
 * (per the DoD checklist "no SAMPLE_A11Y_FINDINGS mocks").
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type LayoutIssueKind =
  | 'overflow-text'
  | 'misalignment'
  | 'orphaned-element'
  | 'off-canvas'
  | 'overlap';

export type AccessibilityIssueKind =
  | 'missing-alt-text'
  | 'missing-caption'
  | 'reading-order'
  | 'low-contrast'
  | 'missing-aria-label';

export interface LayoutIssue {
  readonly id: string;
  readonly kind: LayoutIssueKind;
  readonly slideId: string;
  readonly elementId: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface AccessibilityIssue {
  readonly id: string;
  readonly kind: AccessibilityIssueKind;
  readonly slideId: string;
  readonly elementId: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface LayoutAuditResponse {
  readonly issues: readonly LayoutIssue[];
}

export interface AccessibilityAuditResponse {
  readonly issues: readonly AccessibilityIssue[];
}

export interface FixRequest {
  readonly issueId: string;
  /** Optional free-form instruction appended to the AI prompt. */
  readonly instruction?: string;
}

export interface LayoutFixResponse {
  readonly issueId: string;
  /** JSON-Patch-like ops describing what would change on the slide. */
  readonly patch: ReadonlyArray<LayoutPatchOp>;
  readonly before: string;
  readonly after: string;
}

export interface AccessibilityFixResponse {
  readonly issueId: string;
  readonly patch: ReadonlyArray<AccessibilityPatchOp>;
  readonly before: string;
  readonly after: string;
}

export type LayoutPatchOp =
  | { readonly op: 'resize'; readonly elementId: string; readonly width: number; readonly height: number }
  | { readonly op: 'move'; readonly elementId: string; readonly x: number; readonly y: number }
  | { readonly op: 'remove'; readonly elementId: string }
  | { readonly op: 'set-font-size'; readonly elementId: string; readonly fontSize: number };

export type AccessibilityPatchOp =
  | { readonly op: 'set-alt'; readonly elementId: string; readonly alt: string }
  | { readonly op: 'set-caption'; readonly elementId: string; readonly caption: string }
  | { readonly op: 'reorder'; readonly elementId: string; readonly index: number }
  | { readonly op: 'set-aria-label'; readonly elementId: string; readonly label: string };

// ---------------------------------------------------------------------------
// Low-level helper
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
 * POST /v1/ai/lint-layout — scan a deck for layout problems.
 *
 * @param deckId The deck to inspect.
 * @param baseUrl Override the API base (used in tests).
 */
export function lintLayout(
  deckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LayoutAuditResponse> {
  return postJson<LayoutAuditResponse>(`${baseUrl}/v1/ai/lint-layout`, {
    deck_id: deckId,
  });
}

/**
 * POST /v1/ai/lint-layout/fix — generate a patch preview for one layout
 * issue. The patch is opaque to the UI; the consumer chooses to apply
 * or discard it.
 */
export function fixLayoutIssue(
  deckId: string,
  req: FixRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LayoutFixResponse> {
  return postJson<LayoutFixResponse>(
    `${baseUrl}/v1/ai/lint-layout/fix`,
    { deck_id: deckId, ...req },
  );
}

/**
 * POST /v1/ai/accessibility-audit — scan a deck for a11y problems.
 */
export function auditAccessibility(
  deckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AccessibilityAuditResponse> {
  return postJson<AccessibilityAuditResponse>(
    `${baseUrl}/v1/ai/accessibility-audit`,
    { deck_id: deckId },
  );
}

/**
 * POST /v1/ai/accessibility-audit/fix — generate a patch preview for
 * one a11y issue (alt-text suggestion, caption draft, reading-order
 * index, etc.).
 */
export function fixAccessibilityIssue(
  deckId: string,
  req: FixRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AccessibilityFixResponse> {
  return postJson<AccessibilityFixResponse>(
    `${baseUrl}/v1/ai/accessibility-audit/fix`,
    { deck_id: deckId, ...req },
  );
}
