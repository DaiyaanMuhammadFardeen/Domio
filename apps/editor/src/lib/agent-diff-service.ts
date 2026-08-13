/**
 * agent-diff-service — typed client + seed data for the Wave 10 §S10.10
 * dry-run preview surface.
 *
 * The service wraps the agentic-edit diff endpoint:
 *   - GET  /v1/agent/diffs/{id}     — fetch a proposed structured diff
 *   - POST /v1/agent/diffs/{id}/approve — apply the proposed diff
 *   - POST /v1/agent/diffs/{id}/reject  — discard the proposed diff
 *
 * Every call falls back to deterministic seed data when the backend is
 * unreachable (see §S10.10 acceptance: the dry-run surface must always
 * render *something* during the offline / bootstrap phase). The diffs
 * themselves are structured (per #240): each `DiffItem` carries an op
 * kind (`add` / `change` / `remove`), the target reference (slide or
 * element), and optional before/after payloads for change previews.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiffOp = 'add' | 'change' | 'remove';
export type DiffTargetKind = 'slide' | 'element';

export interface DiffItem {
  readonly id: string;
  readonly target: string;
  readonly target_kind: DiffTargetKind;
  readonly op: DiffOp;
  /** Previous payload — set when `op === 'change'` or `op === 'remove'`. */
  readonly before?: Record<string, unknown>;
  /** New payload — set when `op === 'change'` or `op === 'add'`. */
  readonly after?: Record<string, unknown>;
  /** Short human-readable summary (e.g. "Renamed headline to 'Q3 wins'"). */
  readonly summary: string;
}

export interface AgentDiff {
  readonly id: string;
  readonly agent_id: string;
  readonly agent_name: string;
  readonly created_at_ms: number;
  readonly items: readonly DiffItem[];
  /** Populated once the diff has been approved. */
  readonly applied_at_ms?: number;
}

// ---------------------------------------------------------------------------
// Seed data (used when fetch fails or for tests / offline bootstrap)
// ---------------------------------------------------------------------------

/**
 * A small, deterministic fixture set covering every shape the preview
 * surface needs to render. At least one diff has a mix of add/change/
 * remove operations so the preview exercises all three sections.
 */
const SEED_DIFFS: Readonly<Record<string, AgentDiff>> = {
  'diff-seed-1': {
    id: 'diff-seed-1',
    agent_id: 'agent-narrator',
    agent_name: 'Narrator Agent',
    created_at_ms: 1_726_300_800_000,
    items: [
      {
        id: 'di-1-1',
        target: 'slide-3',
        target_kind: 'slide',
        op: 'change',
        before: { title: 'Q2 recap', layout: 'title-body' },
        after: { title: 'Q3 wins', layout: 'title-body' },
        summary: 'Renamed slide title to "Q3 wins".',
      },
      {
        id: 'di-1-2',
        target: 'elem-3-headline',
        target_kind: 'element',
        op: 'change',
        before: { text: 'Revenue grew 12% QoQ', fontSize: 36 },
        after: { text: 'Revenue grew 18% QoQ, beating forecast', fontSize: 40 },
        summary: 'Updated headline copy and bumped font size.',
      },
      {
        id: 'di-1-3',
        target: 'elem-3-cta',
        target_kind: 'element',
        op: 'add',
        after: { kind: 'button', label: 'Book a demo', href: 'https://example.com/demo' },
        summary: 'Inserted CTA button on slide 3.',
      },
      {
        id: 'di-1-4',
        target: 'elem-3-footer',
        target_kind: 'element',
        op: 'remove',
        before: { kind: 'text', text: 'Internal only' },
        summary: 'Removed draft footer disclaimer.',
      },
    ],
  },
  'diff-seed-2': {
    id: 'diff-seed-2',
    agent_id: 'agent-layout',
    agent_name: 'Layout Agent',
    created_at_ms: 1_726_301_000_000,
    items: [
      {
        id: 'di-2-1',
        target: 'slide-7',
        target_kind: 'slide',
        op: 'add',
        after: { title: 'Pricing overview', layout: 'three-column' },
        summary: 'Inserted new pricing-overview slide.',
      },
      {
        id: 'di-2-2',
        target: 'slide-8',
        target_kind: 'slide',
        op: 'add',
        after: { title: 'FAQ', layout: 'title-bullets' },
        summary: 'Inserted new FAQ slide.',
      },
    ],
  },
  'diff-seed-3': {
    id: 'diff-seed-3',
    agent_id: 'agent-cleanup',
    agent_name: 'Cleanup Agent',
    created_at_ms: 1_726_301_200_000,
    items: [
      {
        id: 'di-3-1',
        target: 'elem-12-logo',
        target_kind: 'element',
        op: 'remove',
        before: { kind: 'image', src: 'placeholder.png', alt: '' },
        summary: 'Removed placeholder logo on closing slide.',
      },
    ],
  },
  'diff-seed-4': {
    id: 'diff-seed-4',
    agent_id: 'agent-brand',
    agent_name: 'Brand Agent',
    created_at_ms: 1_726_301_400_000,
    items: [
      {
        id: 'di-4-1',
        target: 'slide-1',
        target_kind: 'slide',
        op: 'change',
        before: { theme: 'light' },
        after: { theme: 'brand-acme-dark' },
        summary: 'Switched cover slide to brand dark theme.',
      },
      {
        id: 'di-4-2',
        target: 'slide-2',
        target_kind: 'slide',
        op: 'change',
        before: { theme: 'light' },
        after: { theme: 'brand-acme-dark' },
        summary: 'Switched intro slide to brand dark theme.',
      },
      {
        id: 'di-4-3',
        target: 'slide-3',
        target_kind: 'slide',
        op: 'change',
        before: { theme: 'light' },
        after: { theme: 'brand-acme-dark' },
        summary: 'Switched recap slide to brand dark theme.',
      },
      {
        id: 'di-4-4',
        target: 'slide-4',
        target_kind: 'slide',
        op: 'change',
        before: { theme: 'light' },
        after: { theme: 'brand-acme-dark' },
        summary: 'Switched roadmap slide to brand dark theme.',
      },
      {
        id: 'di-4-5',
        target: 'elem-1-bg',
        target_kind: 'element',
        op: 'add',
        after: { kind: 'shape', fill: '#0F172A' },
        summary: 'Added dark background shape behind cover headline.',
      },
    ],
  },
};

export const SEED_DIFF_IDS: ReadonlyArray<string> = Object.keys(SEED_DIFFS);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface AgentFetchOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: unknown;
  readonly baseUrl: string;
  readonly signal?: AbortSignal;
}

async function agentFetch<TResponse>(path: string, opts: AgentFetchOptions): Promise<TResponse> {
  const init: RequestInit = { method: opts.method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  if (opts.signal !== undefined) {
    init.signal = opts.signal;
  }
  const res = await fetch(`${opts.baseUrl}${path}`, init);
  if (!res.ok) {
    throw new Error(`Agent diff API ${res.status} ${res.statusText} (${opts.method} ${path})`);
  }
  return (await res.json()) as TResponse;
}

function lookupSeed(diffId: string): AgentDiff | null {
  const seed = SEED_DIFFS[diffId];
  if (seed !== undefined) return seed;
  // Unknown id → return the first mixed-ops seed so the preview still
  // renders something useful during offline / bootstrap.
  return SEED_DIFFS['diff-seed-1'] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a proposed structured diff by id. Falls back to seed data on
 * network failure or non-2xx response.
 */
export async function getProposedDiff(
  diffId: string,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<AgentDiff | null> {
  try {
    const opts: AgentFetchOptions =
      signal !== undefined ? { method: 'GET', baseUrl, signal } : { method: 'GET', baseUrl };
    return await agentFetch<AgentDiff>(`/v1/agent/diffs/${encodeURIComponent(diffId)}`, opts);
  } catch {
    return lookupSeed(diffId);
  }
}

/**
 * Approve a proposed diff. On success returns the timestamp at which
 * the diff was applied. On failure throws — callers should surface the
 * error in the UI.
 */
export async function approveDiff(
  diffId: string,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<{ applied_at_ms: number }> {
  const opts: AgentFetchOptions =
    signal !== undefined ? { method: 'POST', baseUrl, signal } : { method: 'POST', baseUrl };
  return agentFetch<{ applied_at_ms: number }>(
    `/v1/agent/diffs/${encodeURIComponent(diffId)}/approve`,
    opts,
  );
}

/**
 * Reject a proposed diff. Resolves on success; throws on non-2xx so
 * the UI can surface a retry / error state.
 */
export async function rejectDiff(
  diffId: string,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<void> {
  const opts: AgentFetchOptions =
    signal !== undefined ? { method: 'POST', baseUrl, signal } : { method: 'POST', baseUrl };
  await agentFetch<void>(`/v1/agent/diffs/${encodeURIComponent(diffId)}/reject`, opts);
}

/** Exposed for tests so they can reason about the fallback catalogue. */
export function _seedDiffs(): Readonly<Record<string, AgentDiff>> {
  return SEED_DIFFS;
}
