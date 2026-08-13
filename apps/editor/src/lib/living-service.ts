/**
 * living-service — Wave 11 §S11.2 living-document backend.
 *
 * Provides a typed client for the editor's "living deck" surfaces: a live
 * update badge, an update-stream panel, and per-section version history.
 *
 * Wraps `GET /v1/decks/:id/updates`, `GET /v1/decks/:id/sections/:sid/versions`,
 * `POST /v1/decks/:id/sections/:sid/versions/:vid/restore`, and
 * `POST /v1/decks/:id/refresh`.
 *
 * All endpoints fall back to deterministic seed data when the network is
 * unavailable or returns a non-2xx response:
 *   - 15-20 updates spanning the last 24h, mixed kinds, mixed actors
 *   - 4-5 versions per section
 *
 * Used by:
 *   - apps/editor/src/components/living/LivingBadge.tsx
 *   - apps/editor/src/components/living/UpdateStream.tsx
 *   - apps/editor/src/components/living/SectionHistory.tsx
 */

export type LivingUpdateKind =
  | 'data_refresh'
  | 'comment_added'
  | 'version_published'
  | 'auto_refresh'
  | 'section_restored';

export type LivingActorType = 'system' | 'user' | 'agent';

export interface LivingActor {
  readonly type: LivingActorType;
  readonly id: string;
  readonly name: string;
}

export interface LivingUpdate {
  readonly id: string;
  /** Unix epoch milliseconds. */
  readonly timestamp_ms: number;
  readonly kind: LivingUpdateKind;
  readonly actor: LivingActor;
  readonly summary: string;
  readonly section_id?: string;
}

export interface SectionVersion {
  readonly id: string;
  readonly section_id: string;
  /** Unix epoch milliseconds. */
  readonly timestamp_ms: number;
  readonly author: string;
  readonly change_summary: string;
}

export interface ListUpdatesOptions {
  readonly deckId: string;
  /** Lower bound (inclusive) on timestamp_ms. */
  readonly sinceMs?: number;
}

export interface ListUpdatesResult {
  readonly updates: readonly LivingUpdate[];
  readonly source: 'network' | 'seed';
}

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

/* -------------------------------------------------------------------------- */
/* Seed data                                                                  */
/* -------------------------------------------------------------------------- */

const ACTORS: ReadonlyArray<LivingActor> = [
  { type: 'system', id: 'system:scheduler', name: 'Auto-refresh' },
  { type: 'user', id: 'user:alice', name: 'Alice Chen' },
  { type: 'user', id: 'user:bob', name: 'Bob Martinez' },
  { type: 'agent', id: 'agent-data-explorer', name: 'Data Explorer' },
  { type: 'agent', id: 'agent-content-polisher', name: 'Content Polisher' },
  { type: 'agent', id: 'agent-slide-builder', name: 'Slide Builder' },
];

const SECTIONS: ReadonlyArray<string> = [
  'sec-cover',
  'sec-revenue-q3',
  'sec-pipeline',
  'sec-team-update',
  'sec-closing',
];

interface SeedUpdateSpec {
  readonly minutesAgo: number;
  readonly kind: LivingUpdateKind;
  readonly actorIdx: number;
  readonly sectionIdx?: number;
  readonly summary: string;
}

/**
 * 18 entries spanning the last 24h, mixing all kinds and all actor types.
 * Deterministic — same wall-clock → same IDs/ordering.
 */
const UPDATE_SPECS: ReadonlyArray<SeedUpdateSpec> = [
  { minutesAgo: 2, kind: 'auto_refresh', actorIdx: 0, sectionIdx: 1, summary: 'Auto-refreshed sales pipeline data.' },
  { minutesAgo: 4, kind: 'data_refresh', actorIdx: 1, sectionIdx: 1, summary: 'Refreshed Q3 revenue chart from Salesforce.' },
  { minutesAgo: 9, kind: 'comment_added', actorIdx: 1, sectionIdx: 1, summary: 'Alice commented: "EMEA numbers look off — pulling from CSV instead."' },
  { minutesAgo: 14, kind: 'comment_added', actorIdx: 2, sectionIdx: 3, summary: 'Bob commented: "Let\'s trim the bullet list for the exec read-out."' },
  { minutesAgo: 22, kind: 'data_refresh', actorIdx: 3, sectionIdx: 3, summary: 'Refreshed team-headcount breakdown.' },
  { minutesAgo: 35, kind: 'version_published', actorIdx: 5, sectionIdx: 2, summary: 'Slide Builder published v4 of the pipeline slide.' },
  { minutesAgo: 48, kind: 'auto_refresh', actorIdx: 0, sectionIdx: 4, summary: 'Auto-refreshed closing CTA performance metrics.' },
  { minutesAgo: 67, kind: 'data_refresh', actorIdx: 4, sectionIdx: 2, summary: 'Content Polisher reran the data pipeline and updated charts.' },
  { minutesAgo: 92, kind: 'comment_added', actorIdx: 2, sectionIdx: 0, summary: 'Bob commented: "Move the title to the left for visual balance."' },
  { minutesAgo: 130, kind: 'version_published', actorIdx: 1, sectionIdx: 0, summary: 'Alice published v3 of the cover slide.' },
  { minutesAgo: 180, kind: 'data_refresh', actorIdx: 3, sectionIdx: 1, summary: 'Data Explorer refreshed Q3 revenue numbers.' },
  { minutesAgo: 240, kind: 'comment_added', actorIdx: 1, sectionIdx: 4, summary: 'Alice commented: "Add a link to the pricing sheet in the CTA."' },
  { minutesAgo: 320, kind: 'auto_refresh', actorIdx: 0, sectionIdx: 1, summary: 'Auto-refresh ran on schedule.' },
  { minutesAgo: 410, kind: 'version_published', actorIdx: 5, sectionIdx: 4, summary: 'Slide Builder published v2 of the closing CTA.' },
  { minutesAgo: 530, kind: 'section_restored', actorIdx: 2, sectionIdx: 2, summary: 'Bob restored pipeline slide to v3.' },
  { minutesAgo: 720, kind: 'data_refresh', actorIdx: 3, sectionIdx: 3, summary: 'Data Explorer refreshed team metrics.' },
  { minutesAgo: 980, kind: 'comment_added', actorIdx: 1, sectionIdx: 2, summary: 'Alice commented: "Try a funnel chart here instead of bars."' },
  { minutesAgo: 1320, kind: 'version_published', actorIdx: 4, sectionIdx: 1, summary: 'Content Polisher published v2 of the revenue slide.' },
];

interface SeedVersionSpec {
  readonly minutesAgo: number;
  readonly author: string;
  readonly change_summary: string;
}

const VERSION_SPECS: ReadonlyArray<SeedVersionSpec> = [
  { minutesAgo: 45, author: 'Alice Chen', change_summary: 'Updated Q3 numbers, fixed EMEA column.' },
  { minutesAgo: 180, author: 'Data Explorer', change_summary: 'Auto-restated revenue from Salesforce refresh.' },
  { minutesAgo: 360, author: 'Slide Builder', change_summary: 'Restructured layout to two-column.' },
  { minutesAgo: 720, author: 'Alice Chen', change_summary: 'Initial draft with hand-curated values.' },
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

function buildSeedUpdates(nowMs: number): readonly LivingUpdate[] {
  void pseudoRandomFromSeed(0xBEEF_F00D); // reserved for future jitter
  return UPDATE_SPECS.map((spec, i): LivingUpdate => {
    const actor = ACTORS[spec.actorIdx] ?? ACTORS[0]!;
    const sectionId =
      spec.sectionIdx !== undefined ? SECTIONS[spec.sectionIdx] : undefined;
    return {
      id: `upd-${i.toString().padStart(3, '0')}`,
      timestamp_ms: nowMs - spec.minutesAgo * 60_000,
      kind: spec.kind,
      actor,
      summary: spec.summary,
      ...(sectionId !== undefined ? { section_id: sectionId } : {}),
    };
  });
}

function buildSeedVersions(sectionId: string, nowMs: number): readonly SectionVersion[] {
  return VERSION_SPECS.map((spec, i): SectionVersion => ({
    id: `ver-${sectionId}-${i.toString().padStart(3, '0')}`,
    section_id: sectionId,
    timestamp_ms: nowMs - spec.minutesAgo * 60_000,
    author: spec.author,
    change_summary: spec.change_summary,
  }));
}

/* -------------------------------------------------------------------------- */
/* Network helpers                                                            */
/* -------------------------------------------------------------------------- */

async function safeFetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function applySinceFilter(
  updates: readonly LivingUpdate[],
  sinceMs: number | undefined,
): readonly LivingUpdate[] {
  if (typeof sinceMs !== 'number') return updates;
  return updates.filter((u) => u.timestamp_ms >= sinceMs);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function listUpdates(
  opts: ListUpdatesOptions,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LivingUpdate[]> {
  const { updates } = await listUpdatesWithSource(opts, baseUrl);
  return updates.slice();
}

export async function listUpdatesWithSource(
  opts: ListUpdatesOptions,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ListUpdatesResult> {
  const params = new URLSearchParams();
  if (typeof opts.sinceMs === 'number') params.set('since_ms', String(opts.sinceMs));
  const qs = params.toString();
  const url = `${baseUrl}/v1/decks/${encodeURIComponent(opts.deckId)}/updates${qs ? `?${qs}` : ''}`;

  const body = await safeFetchJson(url);
  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { updates?: unknown }).updates)
  ) {
    const updates = (body as { updates: readonly LivingUpdate[] }).updates;
    return { updates: applySinceFilter(updates, opts.sinceMs), source: 'network' };
  }
  const seed = buildSeedUpdates(Date.now());
  return { updates: applySinceFilter(seed, opts.sinceMs), source: 'seed' };
}

export async function listSectionVersions(
  deckId: string,
  sectionId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<SectionVersion[]> {
  const url = `${baseUrl}/v1/decks/${encodeURIComponent(deckId)}/sections/${encodeURIComponent(sectionId)}/versions`;
  const body = await safeFetchJson(url);
  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { versions?: unknown }).versions)
  ) {
    return (body as { versions: readonly SectionVersion[] }).versions.slice();
  }
  return buildSeedVersions(sectionId, Date.now()).slice();
}

export async function restoreSectionVersion(
  deckId: string,
  sectionId: string,
  versionId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<{ restored_at_ms: number }> {
  const url = `${baseUrl}/v1/decks/${encodeURIComponent(deckId)}/sections/${encodeURIComponent(sectionId)}/versions/${encodeURIComponent(versionId)}/restore`;
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { restored_at_ms?: number };
      if (typeof body.restored_at_ms === 'number') {
        return { restored_at_ms: body.restored_at_ms };
      }
    }
  } catch {
    // fall through to seed return
  }
  return { restored_at_ms: Date.now() };
}

export async function triggerRefresh(
  deckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  const url = `${baseUrl}/v1/decks/${encodeURIComponent(deckId)}/refresh`;
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) return;
  } catch {
    // swallow — UI should still optimistically reflect the refresh.
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for tests + components)                             */
/* -------------------------------------------------------------------------- */

/**
 * Human-friendly relative timestamp. Returns "just now" for sub-minute diffs,
 * then "{n}m ago" / "{n}h ago" / "{n}d ago". Never returns negative.
 */
export function formatRelative(timestamp_ms: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - timestamp_ms);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hour)}h ago`;
  return `${Math.round(diff / day)}d ago`;
}

/** Distinct kinds present in an update list. Preserves first-seen order. */
export function distinctKinds(
  updates: readonly LivingUpdate[],
): ReadonlyArray<LivingUpdateKind> {
  const seen = new Set<LivingUpdateKind>();
  const out: LivingUpdateKind[] = [];
  for (const u of updates) {
    if (seen.has(u.kind)) continue;
    seen.add(u.kind);
    out.push(u.kind);
  }
  return out;
}

/** The most recent update's timestamp_ms, or undefined if list is empty. */
export function lastUpdateMs(updates: readonly LivingUpdate[]): number | undefined {
  if (updates.length === 0) return undefined;
  let max = updates[0]!.timestamp_ms;
  for (let i = 1; i < updates.length; i++) {
    const t = updates[i]!.timestamp_ms;
    if (t > max) max = t;
  }
  return max;
}
