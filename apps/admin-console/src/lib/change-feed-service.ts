/**
 * Change-feed service — Wave 10 §S10.7.
 *
 * Server-sent change feed inspector backing data. The admin console
 * pages/surfaces fetch ops from `/v1/decks/:id/change-feed` and fall
 * back to deterministic seed data whenever the upstream is unreachable
 * so the inspector is demonstrable even before that endpoint lands.
 *
 * The data model mirrors a CRDT-style mutation log: each op carries an
 * op-kind, an actor (user or agent), an optional trace id, and a free
 * payload so the JSON viewer in the UI has something meaningful to show.
 */

import { fetcher } from './fetcher';

export type ChangeFeedOpKind =
  | 'slide_create'
  | 'slide_delete'
  | 'slide_update'
  | 'element_create'
  | 'element_update'
  | 'element_delete'
  | 'variable_set'
  | 'theme_apply'
  | 'brand_lock_check'
  | 'ai_suggest'
  | 'ai_apply';

export const CHANGE_FEED_OP_KINDS: ReadonlyArray<ChangeFeedOpKind> = [
  'slide_create',
  'slide_delete',
  'slide_update',
  'element_create',
  'element_update',
  'element_delete',
  'variable_set',
  'theme_apply',
  'brand_lock_check',
  'ai_suggest',
  'ai_apply',
];

export interface ChangeFeedActor {
  readonly type: 'user' | 'agent';
  readonly id: string;
  readonly name: string;
}

export interface ChangeFeedOp {
  readonly id: string;
  readonly timestamp_ms: number;
  readonly kind: ChangeFeedOpKind;
  readonly actor: ChangeFeedActor;
  readonly deck_id: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly trace_id?: string;
}

/**
 * Anchor "now" so the seeded ops are stable across reloads in dev.
 * Tests only care about relative ordering and op-kind coverage.
 */
const ANCHOR_NOW_MS = Date.UTC(2026, 7, 13, 12, 0, 0); // 2026-08-13T12:00:00Z
const FIVE_MIN_MS = 5 * 60_000;

// ── Seed data ───────────────────────────────────────────────────────────

interface SeedActor {
  readonly id: string;
  readonly name: string;
  readonly type: ChangeFeedActor['type'];
}

const SEED_ACTORS: ReadonlyArray<SeedActor> = [
  { id: 'u-alice', name: 'Alice Chen', type: 'user' },
  { id: 'u-bob', name: 'Bob Tanaka', type: 'user' },
  { id: 'u-carol', name: 'Carol Singh', type: 'user' },
  { id: 'u-dave', name: 'Dave Okafor', type: 'user' },
  { id: 'u-erin', name: 'Erin Larsen', type: 'user' },
  { id: 'agent-layout', name: 'Layout Agent', type: 'agent' },
  { id: 'agent-style', name: 'Style Agent', type: 'agent' },
  { id: 'agent-narrator', name: 'Narrator Agent', type: 'agent' },
];

interface SeedOp {
  /** Minutes ago. */
  readonly minutes_ago: number;
  readonly kind: ChangeFeedOpKind;
  readonly actor_id: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly trace_id?: string;
}

const SEED_OPS: ReadonlyArray<SeedOp> = [
  {
    minutes_ago: 0.2,
    kind: 'element_update',
    actor_id: 'u-bob',
    summary: 'Updated text on element el-2041',
    payload: { element_id: 'el-2041', field: 'text', before: 'Q3 metrics', after: 'Q3 metrics — by region' },
  },
  {
    minutes_ago: 0.4,
    kind: 'ai_suggest',
    actor_id: 'agent-narrator',
    summary: 'AI suggested a headline for slide s-07',
    payload: { slide_id: 's-07', suggestion: 'Add a headline summarising the regional split' },
  },
  {
    minutes_ago: 0.7,
    kind: 'variable_set',
    actor_id: 'u-alice',
    summary: 'Set variable color.brand to #1d4ed8',
    payload: { key: 'color.brand', value: '#1d4ed8' },
  },
  {
    minutes_ago: 1.0,
    kind: 'ai_apply',
    actor_id: 'agent-narrator',
    summary: 'AI applied the headline suggestion',
    payload: { slide_id: 's-07', applied: true, source_op: 'op-021' },
  },
  {
    minutes_ago: 1.3,
    kind: 'brand_lock_check',
    actor_id: 'agent-style',
    summary: 'Brand-lock check passed for slide s-08',
    payload: { slide_id: 's-08', violations: 0, kit_id: 'kit-acme' },
  },
  {
    minutes_ago: 1.5,
    kind: 'element_create',
    actor_id: 'u-carol',
    summary: 'Created chart on slide s-08',
    payload: { element_id: 'el-3012', type: 'chart', slide_id: 's-08' },
  },
  {
    minutes_ago: 1.8,
    kind: 'theme_apply',
    actor_id: 'u-dave',
    summary: 'Applied theme "Acme Light"',
    payload: { theme: 'Acme Light', changes: ['font.body', 'palette.primary'] },
  },
  {
    minutes_ago: 2.0,
    kind: 'slide_create',
    actor_id: 'u-alice',
    summary: 'Created slide "Executive summary"',
    payload: { slide_id: 's-09', title: 'Executive summary', order: 9 },
  },
  {
    minutes_ago: 2.3,
    kind: 'element_delete',
    actor_id: 'u-bob',
    summary: 'Deleted placeholder element on slide s-03',
    payload: { element_id: 'el-1990', slide_id: 's-03' },
  },
  {
    minutes_ago: 2.6,
    kind: 'slide_update',
    actor_id: 'u-erin',
    summary: 'Renamed slide s-03 to "Why now"',
    payload: { slide_id: 's-03', before: 'Untitled', after: 'Why now' },
  },
  {
    minutes_ago: 2.9,
    kind: 'element_update',
    actor_id: 'agent-layout',
    summary: 'Auto-aligned three elements on slide s-04',
    payload: { slide_id: 's-04', affected: ['el-2101', 'el-2102', 'el-2103'] },
  },
  {
    minutes_ago: 3.1,
    kind: 'variable_set',
    actor_id: 'u-carol',
    summary: 'Set variable font.heading to Inter',
    payload: { key: 'font.heading', value: 'Inter' },
  },
  {
    minutes_ago: 3.3,
    kind: 'brand_lock_check',
    actor_id: 'agent-style',
    summary: 'Brand-lock check flagged 2 violations on s-02',
    payload: { slide_id: 's-02', violations: 2, kit_id: 'kit-acme', details: ['contrast', 'logo-size'] },
  },
  {
    minutes_ago: 3.5,
    kind: 'element_update',
    actor_id: 'u-dave',
    summary: 'Updated image alt text',
    payload: { element_id: 'el-1500', field: 'alt', before: 'image', after: 'product hero shot showing the X-200' },
  },
  {
    minutes_ago: 3.7,
    kind: 'slide_delete',
    actor_id: 'u-alice',
    summary: 'Deleted slide "Old draft"',
    payload: { slide_id: 's-old-77', reason: 'cleanup' },
  },
  {
    minutes_ago: 3.9,
    kind: 'ai_suggest',
    actor_id: 'agent-narrator',
    summary: 'Suggested narrative for slide s-01',
    payload: { slide_id: 's-01', suggestion: 'Open with the headline result, then walk the audience through the three supporting data points.' },
  },
  {
    minutes_ago: 4.1,
    kind: 'element_create',
    actor_id: 'u-bob',
    summary: 'Created text element on slide s-01',
    payload: { element_id: 'el-3320', type: 'text', slide_id: 's-01' },
  },
  {
    minutes_ago: 4.3,
    kind: 'theme_apply',
    actor_id: 'u-erin',
    summary: 'Reverted to theme default',
    payload: { theme: 'default', changes: ['reset'] },
  },
  {
    minutes_ago: 4.5,
    kind: 'slide_update',
    actor_id: 'u-carol',
    summary: 'Reordered slide s-04 to position 2',
    payload: { slide_id: 's-04', before_order: 4, after_order: 2 },
  },
  {
    minutes_ago: 4.8,
    kind: 'element_update',
    actor_id: 'agent-layout',
    summary: 'Reflowed the grid on slide s-05',
    payload: { slide_id: 's-05', columns: 3, gutter: '1rem' },
    trace_id: 'trace-77af-22b1',
  },
];

const SEED_BY_KIND: ReadonlyArray<ChangeFeedOpKind> = CHANGE_FEED_OP_KINDS;

function seedActor(actorId: string): SeedActor {
  const found = SEED_ACTORS.find((a) => a.id === actorId);
  // Fall back to a sentinel so the seed is decoupled from any specific id.
  return found ?? { id: actorId, name: actorId, type: 'user' };
}

function buildSeedOps(deckId: string): ReadonlyArray<ChangeFeedOp> {
  const ops = SEED_OPS.map((seed, index) => {
    const actor = seedActor(seed.actor_id);
    const ms = ANCHOR_NOW_MS - Math.round(seed.minutes_ago * 60_000);
    return {
      id: `cf-${deckId}-${String(index + 1).padStart(3, '0')}`,
      timestamp_ms: ms,
      kind: seed.kind,
      actor: { type: actor.type, id: actor.id, name: actor.name },
      deck_id: deckId,
      summary: seed.summary,
      payload: seed.payload,
      ...(seed.trace_id ? { trace_id: seed.trace_id } : {}),
    } satisfies ChangeFeedOp;
  });
  // Sort newest first.
  return [...ops].sort((a, b) => b.timestamp_ms - a.timestamp_ms);
}

/**
 * Returns true when the supplied kind is one of the known op kinds.
 * Useful for guarding mock payloads when consumers build their own seeds.
 */
export function isChangeFeedOpKind(kind: string): kind is ChangeFeedOpKind {
  return SEED_BY_KIND.includes(kind as ChangeFeedOpKind);
}

/**
 * Fetch recent ops for a deck. Falls back to the deterministic seed
 * (~20 ops covering the last 5 minutes) when the upstream is missing
 * or returns an error so the inspector remains demonstrable.
 */
export async function listChangeFeed(opts: {
  deckId: string;
  sinceMs?: number;
}): Promise<ReadonlyArray<ChangeFeedOp>> {
  const deckId = opts.deckId;
  if (!deckId) return [];
  try {
    const params = new URLSearchParams();
    if (typeof opts.sinceMs === 'number') {
      params.set('since_ms', String(opts.sinceMs));
    }
    const qs = params.toString();
    const path = `/v1/decks/${encodeURIComponent(deckId)}/change-feed${
      qs ? `?${qs}` : ''
    }`;
    const json = await fetcher<{ ops?: ChangeFeedOp[] } | ChangeFeedOp[]>(path);
    const ops = Array.isArray(json) ? json : (json.ops ?? []);
    if (ops.length > 0) {
      const filtered =
        typeof opts.sinceMs === 'number'
          ? ops.filter((o) => o.timestamp_ms > (opts.sinceMs as number))
          : ops;
      return filtered.slice().sort((a, b) => b.timestamp_ms - a.timestamp_ms);
    }
    // Empty response — fall through to seed.
    return buildSeedOps(deckId);
  } catch {
    return buildSeedOps(deckId);
  }
}

/**
 * Replay ops between two timestamps (inclusive lower, exclusive upper).
 * Falls back to the seed when upstream is unreachable; replay then
 * filters the seed into the requested window so callers get a
 * believable subset even without a real backend.
 */
export async function replayChangeFeed(
  deckId: string,
  fromMs: number,
  toMs: number,
): Promise<ReadonlyArray<ChangeFeedOp>> {
  if (!deckId) return [];
  if (!(toMs > fromMs)) return [];
  try {
    const params = new URLSearchParams({ from_ms: String(fromMs), to_ms: String(toMs) });
    const path = `/v1/decks/${encodeURIComponent(
      deckId,
    )}/change-feed/replay?${params.toString()}`;
    const json = await fetcher<{ ops?: ChangeFeedOp[] } | ChangeFeedOp[]>(path);
    const ops = Array.isArray(json) ? json : (json.ops ?? []);
    return ops
      .filter((o) => o.timestamp_ms >= fromMs && o.timestamp_ms < toMs)
      .slice()
      .sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  } catch {
    const seed = buildSeedOps(deckId);
    return seed
      .filter((o) => o.timestamp_ms >= fromMs && o.timestamp_ms < toMs)
      .slice()
      .sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  }
}

/** Upper bound (ms) for the deterministic seed window. */
export function seedWindowEndMs(): number {
  return ANCHOR_NOW_MS;
}

/** Lower bound (ms) for the deterministic seed window. */
export function seedWindowStartMs(): number {
  return ANCHOR_NOW_MS - FIVE_MIN_MS;
}
