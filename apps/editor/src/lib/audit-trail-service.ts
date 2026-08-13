/**
 * audit-trail-service — Wave 10 §S10.9 tool-call transcript viewer backend.
 *
 * Provides a typed client for the editor's Agent Audit Trail surface.
 * Wraps `GET /v1/agents/audit` and falls back to deterministic seed data
 * (15-20 entries spanning the last 24h, mixed agents + humans, mixed
 * statuses) when the network is unavailable or the endpoint returns a
 * non-2xx response.
 *
 * Used by `apps/editor/src/components/prototyping/agent/AuditTrail.tsx`.
 */

export type AuditEntryKind = 'agent_call' | 'human_edit';

export interface AuditEntry {
  readonly id: string;
  /** Unix epoch milliseconds. */
  readonly timestamp_ms: number;
  readonly agent_id: string;
  readonly agent_name: string;
  readonly tool: string;
  readonly kind: AuditEntryKind;
  readonly request: Record<string, unknown>;
  readonly response: Record<string, unknown>;
  /** HTTP-style status code (200, 4xx, 5xx). */
  readonly status: number;
  /** Wall-clock latency in milliseconds. */
  readonly latency_ms: number;
}

export interface AuditListOptions {
  readonly agentId?: string | undefined;
  readonly tool?: string | undefined;
  /** Lower bound on timestamp_ms (inclusive). */
  readonly sinceMs?: number | undefined;
  readonly kind?: AuditEntryKind | 'all' | undefined;
}

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

export interface AuditListResult {
  readonly entries: readonly AuditEntry[];
  readonly source: 'network' | 'seed';
}

/* -------------------------------------------------------------------------- */
/* Seed data                                                                  */
/* -------------------------------------------------------------------------- */

const AGENTS: ReadonlyArray<{ readonly id: string; readonly name: string }> = [
  { id: 'agent-slide-builder', name: 'Slide Builder' },
  { id: 'agent-data-explorer', name: 'Data Explorer' },
  { id: 'agent-theme-steward', name: 'Theme Steward' },
  { id: 'agent-content-polisher', name: 'Content Polisher' },
  { id: 'human:alice', name: 'Alice' },
  { id: 'human:bob', name: 'Bob' },
];

const TOOLS: ReadonlyArray<{
  readonly tool: string;
  readonly kind: AuditEntryKind;
  readonly request: Record<string, unknown>;
  readonly response: Record<string, unknown>;
  readonly status: number;
  readonly latencyRange: readonly [number, number];
}> = [
  {
    tool: 'create_slide',
    kind: 'agent_call',
    request: { deckId: 'd-001', title: 'Q3 Overview', layoutHint: 'title-only' },
    response: { id: 'slide-042', index: 3 },
    status: 200,
    latencyRange: [180, 420],
  },
  {
    tool: 'update_layout',
    kind: 'agent_call',
    request: { slideId: 'slide-042', layout: 'two-column' },
    response: { ok: true, changedProps: ['gridTemplateColumns'] },
    status: 200,
    latencyRange: [60, 160],
  },
  {
    tool: 'bind_data_source',
    kind: 'agent_call',
    request: { slideId: 'slide-042', sourceId: 'ds-sales-2026', field: 'revenue' },
    response: { ok: true, boundField: 'revenue' },
    status: 200,
    latencyRange: [120, 260],
  },
  {
    tool: 'apply_theme_token',
    kind: 'agent_call',
    request: { token: 'surface.muted', value: '#F4F5F7' },
    response: { ok: true, version: 17 },
    status: 200,
    latencyRange: [40, 110],
  },
  {
    tool: 'generate_alt_text',
    kind: 'agent_call',
    request: { imageId: 'img-77', locale: 'en-US' },
    response: { alt: 'Bar chart showing Q3 revenue by region' },
    status: 200,
    latencyRange: [820, 1500],
  },
  {
    tool: 'summarize_slide',
    kind: 'agent_call',
    request: { slideId: 'slide-042', maxChars: 140 },
    response: { summary: 'Q3 revenue grew 12% YoY led by EMEA (+18%).' },
    status: 200,
    latencyRange: [600, 1200],
  },
  {
    tool: 'create_chart',
    kind: 'agent_call',
    request: { type: 'bar', dataSourceId: 'ds-sales-2026', xField: 'region', yField: 'revenue' },
    response: { id: 'chart-9' },
    status: 200,
    latencyRange: [220, 480],
  },
  {
    tool: 'reorder_slides',
    kind: 'agent_call',
    request: { deckId: 'd-001', from: 4, to: 2 },
    response: { ok: true, order: ['s0', 's1', 's4', 's2', 's3'] },
    status: 200,
    latencyRange: [70, 180],
  },
  {
    tool: 'validate_deck',
    kind: 'agent_call',
    request: { deckId: 'd-001' },
    response: { ok: false, errors: [{ slideId: 's3', code: 'unbound_token' }] },
    status: 422,
    latencyRange: [300, 700],
  },
  {
    tool: 'recover_failed_tool',
    kind: 'agent_call',
    request: { toolCallId: 'tc-901', attempt: 2 },
    response: { ok: false, error: 'rate_limited' },
    status: 429,
    latencyRange: [50, 110],
  },
  {
    tool: 'edit_text',
    kind: 'human_edit',
    request: { slideId: 's1', elementId: 'e-heading', value: 'Welcome to Domio' },
    response: { ok: true },
    status: 200,
    latencyRange: [10, 30],
  },
  {
    tool: 'edit_color',
    kind: 'human_edit',
    request: { elementId: 'e-heading', prop: 'color', value: '#111827' },
    response: { ok: true },
    status: 200,
    latencyRange: [8, 24],
  },
  {
    tool: 'move_element',
    kind: 'human_edit',
    request: { elementId: 'e-image', x: 220, y: 140 },
    response: { ok: true },
    status: 200,
    latencyRange: [12, 28],
  },
  {
    tool: 'resize_element',
    kind: 'human_edit',
    request: { elementId: 'e-image', width: 320, height: 200 },
    response: { ok: true },
    status: 200,
    latencyRange: [12, 28],
  },
  {
    tool: 'delete_element',
    kind: 'human_edit',
    request: { elementId: 'e-old-callout' },
    response: { ok: true },
    status: 200,
    latencyRange: [10, 24],
  },
  {
    tool: 'duplicate_slide',
    kind: 'human_edit',
    request: { slideId: 's3', insertAt: 4 },
    response: { ok: true, newSlideId: 's4-copy' },
    status: 200,
    latencyRange: [60, 140],
  },
  {
    tool: 'undo',
    kind: 'human_edit',
    request: { steps: 1 },
    response: { ok: true, restoredCheckpoint: 'cp-812' },
    status: 200,
    latencyRange: [10, 30],
  },
];

interface SeedSpec {
  readonly agentIdx: number;
  readonly toolIdx: number;
  /** Minutes ago (negative = in the past). */
  readonly minutesAgo: number;
}

const SEED_SPECS: ReadonlyArray<SeedSpec> = [
  { agentIdx: 0, toolIdx: 0, minutesAgo: 4 },
  { agentIdx: 0, toolIdx: 1, minutesAgo: 5 },
  { agentIdx: 4, toolIdx: 10, minutesAgo: 7 },
  { agentIdx: 1, toolIdx: 6, minutesAgo: 12 },
  { agentIdx: 1, toolIdx: 2, minutesAgo: 13 },
  { agentIdx: 2, toolIdx: 3, minutesAgo: 22 },
  { agentIdx: 5, toolIdx: 11, minutesAgo: 31 },
  { agentIdx: 5, toolIdx: 12, minutesAgo: 32 },
  { agentIdx: 0, toolIdx: 7, minutesAgo: 55 },
  { agentIdx: 4, toolIdx: 13, minutesAgo: 78 },
  { agentIdx: 3, toolIdx: 4, minutesAgo: 110 },
  { agentIdx: 3, toolIdx: 5, minutesAgo: 111 },
  { agentIdx: 4, toolIdx: 14, minutesAgo: 150 },
  { agentIdx: 1, toolIdx: 8, minutesAgo: 230 },
  { agentIdx: 0, toolIdx: 9, minutesAgo: 310 },
  { agentIdx: 4, toolIdx: 15, minutesAgo: 420 },
  { agentIdx: 5, toolIdx: 16, minutesAgo: 610 },
  { agentIdx: 5, toolIdx: 10, minutesAgo: 880 },
];

function pseudoRandomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xFFFFFFFF;
  };
}

function buildSeedEntries(nowMs: number): readonly AuditEntry[] {
  const rand = pseudoRandomFromSeed(0xA0D17EE9);
  return SEED_SPECS.map((spec, i): AuditEntry => {
    const agent = AGENTS[spec.agentIdx] ?? AGENTS[0]!;
    const toolDef = TOOLS[spec.toolIdx] ?? TOOLS[0]!;
    const [latMin, latMax] = toolDef.latencyRange;
    const span = latMax - latMin;
    const latency_ms = Math.max(1, Math.round(latMin + rand() * span));
    const ts = nowMs - spec.minutesAgo * 60_000;
    return {
      id: `audit-${i.toString().padStart(3, '0')}`,
      timestamp_ms: ts,
      agent_id: agent.id,
      agent_name: agent.name,
      tool: toolDef.tool,
      kind: toolDef.kind,
      request: toolDef.request,
      response: toolDef.response,
      status: toolDef.status,
      latency_ms,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetch audit entries from `/v1/agents/audit`, falling back to a
 * deterministic seed dataset when the network is unavailable.
 *
 * Filters are applied client-side after the network round-trip so
 * the seed fallback behaves identically.
 */
export async function listAuditEntries(
  opts: AuditListOptions = {},
  baseUrl: string = DEFAULT_API_BASE,
): Promise<readonly AuditEntry[]> {
  const { source, entries } = await listAuditEntriesWithSource(opts, baseUrl);
  // Silence unused-var lint while preserving the source for callers that
  // want to surface it via `listAuditEntriesWithSource`.
  void source;
  return applyFilters(entries, opts);
}

/**
 * Same as `listAuditEntries`, but the result also indicates whether the
 * data came from the network or the local seed fallback. Useful for UI
 * "offline" indicators and for tests.
 */
export async function listAuditEntriesWithSource(
  opts: AuditListOptions = {},
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AuditListResult> {
  const params = new URLSearchParams();
  if (opts.agentId) params.set('agent_id', opts.agentId);
  if (opts.tool) params.set('tool', opts.tool);
  if (typeof opts.sinceMs === 'number') params.set('since_ms', String(opts.sinceMs));
  if (opts.kind && opts.kind !== 'all') params.set('kind', opts.kind);

  const qs = params.toString();
  const url = `${baseUrl}/v1/agents/audit${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Audit API ${res.status}: ${res.statusText}`);
    const body = (await res.json()) as { entries?: readonly AuditEntry[] };
    if (!body || !Array.isArray(body.entries)) {
      // Malformed payload — fall back to seed so the UI never renders
      // empty due to a backend shape mismatch.
      throw new Error('Audit API: malformed payload (missing `entries` array)');
    }
    return { entries: applyFilters(body.entries, opts), source: 'network' };
  } catch {
    const seed = buildSeedEntries(Date.now());
    return { entries: applyFilters(seed, opts), source: 'seed' };
  }
}

function applyFilters(
  entries: readonly AuditEntry[],
  opts: AuditListOptions,
): readonly AuditEntry[] {
  const { agentId, tool, sinceMs, kind } = opts;
  return entries.filter((entry) => {
    if (agentId && entry.agent_id !== agentId) return false;
    if (tool && entry.tool !== tool) return false;
    if (typeof sinceMs === 'number' && entry.timestamp_ms < sinceMs) return false;
    if (kind && kind !== 'all' && entry.kind !== kind) return false;
    return true;
  });
}

/**
 * Distinct agents present in a list of entries. Used to populate the
 * agent filter dropdown.
 */
export function distinctAgents(
  entries: readonly AuditEntry[],
): ReadonlyArray<{ readonly id: string; readonly name: string }> {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const entry of entries) {
    if (seen.has(entry.agent_id)) continue;
    seen.add(entry.agent_id);
    out.push({ id: entry.agent_id, name: entry.agent_name });
  }
  return out;
}

/**
 * Distinct tools present in a list of entries.
 */
export function distinctTools(entries: readonly AuditEntry[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.tool)) continue;
    seen.add(entry.tool);
    out.push(entry.tool);
  }
  return out;
}

/** Human-friendly relative timestamp (e.g. "5m ago", "2h ago"). */
export function formatRelative(timestamp_ms: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - timestamp_ms);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < hour) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hour)}h ago`;
  return `${Math.round(diff / day)}d ago`;
}

/** Returns the inclusive lower bound (ms) for a given time-range filter. */
export function rangeStartMs(
  range: '1h' | '24h' | '7d' | 'all',
  nowMs: number = Date.now(),
): number | undefined {
  switch (range) {
    case '1h':
      return nowMs - 60 * 60_000;
    case '24h':
      return nowMs - 24 * 60 * 60_000;
    case '7d':
      return nowMs - 7 * 24 * 60 * 60_000;
    case 'all':
      return undefined;
    default:
      return undefined;
  }
}