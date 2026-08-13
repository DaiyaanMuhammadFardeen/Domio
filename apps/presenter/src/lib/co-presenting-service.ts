/**
 * Co-presenting service — multi-presenter session orchestration.
 *
 * Per Wave 11 §S11.9 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Responsibilities:
 *   1. List all presenters currently joined to a session.
 *   2. Identify the active presenter (whoever last advanced a slide).
 *   3. Hand off the active role to a different presenter.
 *   4. Surface per-region audience latency / packet-loss telemetry.
 *   5. Surface the per-region audience viewport states (slide index
 *      + last-update timestamp) so the presenter can see whether
 *      audience displays are keeping up with the most-recent advance.
 *
 * All functions fall back to deterministic, session-scoped seed data so
 * the presenter view is never blocked on backend wiring. The latency /
 * viewport numbers are time-varying so the UI's "updates every 2s"
 * behaviour can be observed locally.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Presenter {
  /** Stable presenter id (e.g. "pres_alice"). */
  id: string;
  /** Display name shown in the SyncStatus pill. */
  name: string;
  /** Optional avatar URL. */
  avatar_url?: string;
  /** True if this presenter is the current active presenter. */
  is_active: boolean;
  /** Epoch ms when the presenter joined the session. */
  joined_at_ms: number;
  /** Epoch ms of last activity (advance / handoff). */
  last_active_at_ms: number;
}

export type RegionSyncStatus = 'synced' | 'lagging' | 'disconnected';

export interface RegionLatency {
  /** Region tag, e.g. "US-East". */
  region: string;
  /** Round-trip latency (ms). */
  latency_ms: number;
  /** 0–100 packet loss percentage. */
  packet_loss_pct: number;
  status: RegionSyncStatus;
  /** Epoch ms the row was last updated. */
  updated_at_ms: number;
}

export interface AudienceViewport {
  /** Region the viewport represents. */
  region: string;
  /** Slide index the audience display is currently on. */
  slide_index: number;
  /** Epoch ms of the last viewport state we observed. */
  updated_at_ms: number;
}

// ─── Seed data ──────────────────────────────────────────────────────────────

/**
 * Stable, deterministic seed presenters. The order is preserved so
 * `Alice` is the initial active presenter (matches the SyncStatus copy
 * "Alice is presenting — Slide 5" from the spec).
 */
const SEED_PRESENTERS: ReadonlyArray<Presenter> = [
  {
    id: 'pres_alice',
    name: 'Alice',
    is_active: true,
    joined_at_ms: 1_730_000_000_000,
    last_active_at_ms: 1_730_000_120_000,
  },
  {
    id: 'pres_bob',
    name: 'Bob',
    is_active: false,
    joined_at_ms: 1_730_000_030_000,
    last_active_at_ms: 1_730_000_090_000,
  },
  {
    id: 'pres_carla',
    name: 'Carla',
    is_active: false,
    joined_at_ms: 1_730_000_060_000,
    last_active_at_ms: 1_730_000_080_000,
  },
];

/**
 * Stable seed regions + their characteristic latency / loss profile.
 * The latency ranges are designed to land each region in a different
 * sync band (synced / lagging / disconnected) when seeded at t=0.
 */
const SEED_REGIONS: ReadonlyArray<{
  region: string;
  base_latency_ms: number;
  base_loss_pct: number;
  base_status: RegionSyncStatus;
}> = [
  { region: 'US-East', base_latency_ms: 42, base_loss_pct: 0.1, base_status: 'synced' },
  { region: 'US-West', base_latency_ms: 78, base_loss_pct: 0.4, base_status: 'synced' },
  { region: 'EU-Central', base_latency_ms: 165, base_loss_pct: 1.2, base_status: 'lagging' },
  { region: 'AP-South', base_latency_ms: 240, base_loss_pct: 2.4, base_status: 'lagging' },
  {
    region: 'AP-Northeast',
    base_latency_ms: 9999,
    base_loss_pct: 100,
    base_status: 'disconnected',
  },
];

const SEED_VIEWPORTS: ReadonlyArray<AudienceViewport> = [
  { region: 'US-East', slide_index: 5, updated_at_ms: 1_730_000_120_000 },
  { region: 'US-West', slide_index: 5, updated_at_ms: 1_730_000_119_000 },
  { region: 'EU-Central', slide_index: 4, updated_at_ms: 1_730_000_118_000 },
  { region: 'AP-South', slide_index: 4, updated_at_ms: 1_730_000_117_000 },
];

// ─── In-memory state ────────────────────────────────────────────────────────

/**
 * Session-scoped in-memory state so handoff + latency mutations persist
 * across renders during a test or a live demo. Keyed by sessionId.
 */
const presentersBySession = new Map<string, Presenter[]>();
const activePresenterIdBySession = new Map<string, string>();
const viewportsBySession = new Map<string, AudienceViewport[]>();

function ensureSeed(sessionId: string): void {
  if (!presentersBySession.has(sessionId)) {
    presentersBySession.set(
      sessionId,
      SEED_PRESENTERS.map((p) => ({ ...p })),
    );
    activePresenterIdBySession.set(
      sessionId,
      SEED_PRESENTERS.find((p) => p.is_active)?.id ?? SEED_PRESENTERS[0]!.id,
    );
  }
  if (!viewportsBySession.has(sessionId)) {
    viewportsBySession.set(
      sessionId,
      SEED_VIEWPORTS.map((v) => ({ ...v })),
    );
  }
}

function hashSeed(sessionId: string): number {
  // Simple deterministic 32-bit hash so jitter is stable per session.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Networking helpers ─────────────────────────────────────────────────────

const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await doFetch(url, { method: 'GET', credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Presenters ─────────────────────────────────────────────────────────────

/** Return all presenters joined to the session. */
export async function listPresenters(sessionId: string): Promise<Presenter[]> {
  const remote = await getJson<Presenter[]>(
    `${DEFAULT_API_BASE}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/co-presenters`,
  );
  if (remote && remote.length > 0) return remote;

  ensureSeed(sessionId);
  return (presentersBySession.get(sessionId) ?? []).map((p) => ({ ...p }));
}

/** Return the currently-active presenter, or null if none is active. */
export async function getActivePresenter(sessionId: string): Promise<Presenter | null> {
  const remote = await getJson<Presenter | null>(
    `${DEFAULT_API_BASE}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/co-presenters/active`,
  );
  if (remote) return remote;

  ensureSeed(sessionId);
  const list = presentersBySession.get(sessionId) ?? [];
  const id = activePresenterIdBySession.get(sessionId);
  return list.find((p) => p.id === id) ?? null;
}

/**
 * Hand off the active role to another presenter. Throws if the target
 * isn't joined to the session. Returns the handoff timestamp.
 */
export async function handoffToPresenter(
  sessionId: string,
  toPresenterId: string,
): Promise<{ handed_off_at_ms: number }> {
  const remote = await postJson<{ handed_off_at_ms: number }>(
    `${DEFAULT_API_BASE}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/co-presenters/handoff`,
    { to_presenter_id: toPresenterId },
  );
  if (remote) return remote;

  ensureSeed(sessionId);
  const list = presentersBySession.get(sessionId) ?? [];
  const target = list.find((p) => p.id === toPresenterId);
  if (!target) {
    throw new Error(`presenter ${toPresenterId} is not joined to session ${sessionId}`);
  }
  const now = Date.now();
  const updated = list.map((p) => ({
    ...p,
    is_active: p.id === toPresenterId,
    last_active_at_ms: p.id === toPresenterId ? now : p.last_active_at_ms,
  }));
  presentersBySession.set(sessionId, updated);
  activePresenterIdBySession.set(sessionId, toPresenterId);
  return { handed_off_at_ms: now };
}

// ─── Latency ────────────────────────────────────────────────────────────────

/**
 * Return per-region latency. Numbers drift slightly over time so the
 * 2-second polling loop in the UI shows realistic-looking motion.
 */
export async function listRegionLatencies(sessionId: string): Promise<RegionLatency[]> {
  const remote = await getJson<RegionLatency[]>(
    `${DEFAULT_API_BASE}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/regions/latency`,
  );
  if (remote && remote.length > 0) return remote;

  const now = Date.now();
  const seed = hashSeed(sessionId);
  return SEED_REGIONS.map((r, i) => {
    // ±10% jitter on latency, ±0.3% on loss, deterministic per (session, region, time).
    const tick = Math.floor(now / 2000);
    const jitterKey = (seed ^ (i * 2654435761) ^ tick) >>> 0;
    const jitterLatency = ((jitterKey % 21) - 10) / 100; // -0.10..+0.10
    const jitterLoss = (((jitterKey >> 8) % 7) - 3) / 10; // -0.3..+0.3
    const latency_ms = Math.max(1, Math.round(r.base_latency_ms * (1 + jitterLatency)));
    const packet_loss_pct = Math.max(0, Math.min(100, +(r.base_loss_pct + jitterLoss).toFixed(2)));
    const status: RegionSyncStatus = r.base_status;
    return {
      region: r.region,
      latency_ms,
      packet_loss_pct,
      status,
      updated_at_ms: now,
    };
  });
}

// ─── Audience viewports ─────────────────────────────────────────────────────

/**
 * Return audience viewport states. Two regions are typically synced to
 * the active slide; two lag by one slide (the audience rendering loop
 * hasn't caught up yet). Mirrors what the SyncStatus pill is showing.
 */
export async function listAudienceViewports(sessionId: string): Promise<AudienceViewport[]> {
  const remote = await getJson<AudienceViewport[]>(
    `${DEFAULT_API_BASE}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/audience/viewports`,
  );
  if (remote && remote.length > 0) return remote;

  ensureSeed(sessionId);
  return (viewportsBySession.get(sessionId) ?? []).map((v) => ({ ...v }));
}

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Reset in-memory state for tests. Not exported in the public docs —
 * but visible to tests so they can construct a clean slate.
 */
export function __resetCoPresentingState(): void {
  presentersBySession.clear();
  activePresenterIdBySession.clear();
  viewportsBySession.clear();
}

/** Inject a custom presenter list for tests. */
export function __setPresentersForTest(sessionId: string, list: Presenter[]): void {
  presentersBySession.set(
    sessionId,
    list.map((p) => ({ ...p })),
  );
  const active = list.find((p) => p.is_active);
  activePresenterIdBySession.set(sessionId, active?.id ?? list[0]!.id);
}
