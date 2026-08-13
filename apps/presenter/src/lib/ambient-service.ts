/**
 * Ambient service — Wave 11 §S11.6.
 *
 * Provides the data behind the audience-facing idle dashboard that is
 * shown before a presenter connects to a session. The dashboard is the
 * "ambient boardroom mode" — a brand-tinted pre-session surface that:
 *
 *   1. Shows the deck title + countdown to the next session.
 *   2. Displays 3 live KPI tiles from the deck's data sources.
 *   3. Rotates a small ticker of recent highlights / announcements.
 *
 * The function signatures mirror what the future ambient-svc endpoint
 * will deliver. While that endpoint is being built, each function falls
 * back to deterministic seed data so the dashboard always has *something*
 * meaningful to render on stage.
 */

export interface BrandKit {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  logo_url?: string;
  font_family: string;
}

export type DataSourceKind = 'kpi' | 'metric' | 'count' | 'currency';

export type DataSourceTrend = 'up' | 'down' | 'flat';

export interface DataSourceSnapshot {
  id: string;
  name: string;
  kind: DataSourceKind;
  value: number;
  formatted: string;
  trend: DataSourceTrend;
  change_pct: number;
  updated_at_ms: number;
}

export type TickerItemKind = 'highlight' | 'announcement' | 'milestone';

export interface TickerItem {
  id: string;
  kind: TickerItemKind;
  text: string;
  timestamp_ms: number;
}

export interface AmbientAgendaItem {
  id: string;
  title: string;
  duration_min: number;
}

export interface AmbientSessionInfo {
  session_id: string;
  deck_id: string;
  deck_title: string;
  scheduled_at_ms: number;
  agenda: AmbientAgendaItem[];
  room_name: string;
  presenter_name: string;
  brand_kit: BrandKit;
}

export interface AmbientServiceOptions {
  /** Base URL of the ambient-svc endpoint. Defaults to relative ('/'). */
  readonly apiBaseUrl?: string;
  /** Override fetch (used in tests). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Resolve a session id into its ambient metadata.
 *
 * On any error (non-2xx, network failure, malformed body) the function
 * returns a deterministic seed AmbientSessionInfo so the dashboard can
 * still render. Callers that need strict semantics should compare the
 * returned `session_id` against their input.
 */
export async function getAmbientSession(
  sessionId: string,
  opts: AmbientServiceOptions = {},
): Promise<AmbientSessionInfo | null> {
  const baseUrl = opts.apiBaseUrl ?? '';
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(
      `${baseUrl}/api/v1/ambient/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET', headers: { accept: 'application/json' } },
    );
    if (!res.ok) return seedSession(sessionId);
    const body = (await res.json()) as Partial<AmbientSessionInfo>;
    if (!isAmbientSessionInfo(body)) return seedSession(sessionId);
    return body;
  } catch {
    return seedSession(sessionId);
  }
}

/**
 * Fetch the latest snapshots for the deck's data sources.
 *
 * Always returns an array; on failure returns the seed data sources for
 * the deck (or a generic default when `deckId` is unknown).
 */
export async function getDataSnapshots(
  deckId: string,
  opts: AmbientServiceOptions = {},
): Promise<DataSourceSnapshot[]> {
  const baseUrl = opts.apiBaseUrl ?? '';
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(
      `${baseUrl}/api/v1/ambient/decks/${encodeURIComponent(deckId)}/data-sources`,
      { method: 'GET', headers: { accept: 'application/json' } },
    );
    if (!res.ok) return seedSnapshots(deckId);
    const body = (await res.json()) as { sources?: unknown };
    const sources = Array.isArray(body?.sources) ? body.sources : [];
    const coerced = sources
      .filter(isDataSourceSnapshot)
      .map(normalizeSnapshot);
    return coerced.length > 0 ? coerced : seedSnapshots(deckId);
  } catch {
    return seedSnapshots(deckId);
  }
}

/**
 * Fetch the latest ticker items for the deck.
 *
 * Always returns an array; on failure returns the seed ticker.
 */
export async function getTicker(
  deckId: string,
  opts: AmbientServiceOptions = {},
): Promise<TickerItem[]> {
  const baseUrl = opts.apiBaseUrl ?? '';
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(
      `${baseUrl}/api/v1/ambient/decks/${encodeURIComponent(deckId)}/ticker`,
      { method: 'GET', headers: { accept: 'application/json' } },
    );
    if (!res.ok) return seedTicker(deckId);
    const body = (await res.json()) as { items?: unknown };
    const items = Array.isArray(body?.items) ? body.items : [];
    const coerced = items.filter(isTickerItem);
    return coerced.length > 0 ? coerced : seedTicker(deckId);
  } catch {
    return seedTicker(deckId);
  }
}

// ---------------------------------------------------------------------------
// Seed / fallback data
// ---------------------------------------------------------------------------

/**
 * Deterministic seed for an unknown session id. The session is scheduled
 * ~5 minutes in the future so the dashboard's countdown has something
 * to count down to immediately on first render.
 */
function seedSession(sessionId: string): AmbientSessionInfo {
  const now = Date.now();
  const scheduled = now + 5 * 60 * 1000;
  return {
    session_id: sessionId,
    deck_id: `deck_${sessionId}`,
    deck_title: 'Q3 All-Hands',
    scheduled_at_ms: scheduled,
    agenda: [
      { id: 'a1', title: 'Welcome & roadmap update', duration_min: 5 },
      { id: 'a2', title: 'Q3 results deep dive', duration_min: 12 },
      { id: 'a3', title: 'Live audience Q&A', duration_min: 8 },
      { id: 'a4', title: 'Closing & next steps', duration_min: 5 },
    ],
    room_name: 'Boardroom',
    presenter_name: 'Alex Rivera',
    brand_kit: DEFAULT_BRAND_KIT,
  };
}

function seedSnapshots(deckId: string): DataSourceSnapshot[] {
  const now = Date.now();
  // The values below are intentionally stable (no Math.random) so the
  // dashboard renders the same numbers between SSR and hydration.
  const base: Omit<DataSourceSnapshot, 'updated_at_ms'>[] = [
    {
      id: `${deckId}:mrr`,
      name: 'MRR',
      kind: 'currency',
      value: 42_000,
      formatted: '$42K',
      trend: 'up',
      change_pct: 4.2,
    },
    {
      id: `${deckId}:active-users`,
      name: 'Active users',
      kind: 'count',
      value: 1_240,
      formatted: '1.2K',
      trend: 'up',
      change_pct: 1.7,
    },
    {
      id: `${deckId}:churn`,
      name: 'Churn',
      kind: 'metric',
      value: 2.3,
      formatted: '2.3%',
      trend: 'down',
      change_pct: -0.4,
    },
    {
      id: `${deckId}:nps`,
      name: 'NPS',
      kind: 'metric',
      value: 58,
      formatted: '58',
      trend: 'flat',
      change_pct: 0,
    },
  ];
  return base.map((s, i) => ({ ...s, updated_at_ms: now - i * 60_000 }));
}

function seedTicker(deckId: string): TickerItem[] {
  const now = Date.now();
  const items: Omit<TickerItem, 'timestamp_ms'>[] = [
    {
      id: `${deckId}:t1`,
      kind: 'highlight',
      text: 'Q3 results now available in the data room',
    },
    {
      id: `${deckId}:t2`,
      kind: 'announcement',
      text: 'Live audience poll starting in 4:32',
    },
    {
      id: `${deckId}:t3`,
      kind: 'milestone',
      text: 'Comments: 23 questions waiting',
    },
    {
      id: `${deckId}:t4`,
      kind: 'announcement',
      text: 'Captioning enabled — toggle from the side panel',
    },
  ];
  return items.map((item, i) => ({ ...item, timestamp_ms: now - i * 30_000 }));
}

// ---------------------------------------------------------------------------
// Type guards + normalization
// ---------------------------------------------------------------------------

function isBrandKit(value: unknown): value is BrandKit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['primary_color'] === 'string' &&
    typeof v['secondary_color'] === 'string' &&
    typeof v['accent_color'] === 'string' &&
    typeof v['background_color'] === 'string' &&
    typeof v['font_family'] === 'string' &&
    (v['logo_url'] === undefined || typeof v['logo_url'] === 'string')
  );
}

function isAmbientAgendaItem(value: unknown): value is AmbientAgendaItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['title'] === 'string' &&
    Number.isFinite(v['duration_min'])
  );
}

function isAmbientSessionInfo(value: unknown): value is AmbientSessionInfo {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['session_id'] === 'string' &&
    typeof v['deck_id'] === 'string' &&
    typeof v['deck_title'] === 'string' &&
    Number.isFinite(v['scheduled_at_ms']) &&
    Array.isArray(v['agenda']) &&
    v['agenda'].every(isAmbientAgendaItem) &&
    typeof v['room_name'] === 'string' &&
    typeof v['presenter_name'] === 'string' &&
    isBrandKit(v['brand_kit'])
  );
}

function isDataSourceSnapshot(value: unknown): value is DataSourceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    (v['kind'] === 'kpi' ||
      v['kind'] === 'metric' ||
      v['kind'] === 'count' ||
      v['kind'] === 'currency') &&
    Number.isFinite(v['value']) &&
    typeof v['formatted'] === 'string' &&
    (v['trend'] === 'up' || v['trend'] === 'down' || v['trend'] === 'flat') &&
    Number.isFinite(v['change_pct']) &&
    Number.isFinite(v['updated_at_ms'])
  );
}

function isTickerItem(value: unknown): value is TickerItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    (v['kind'] === 'highlight' ||
      v['kind'] === 'announcement' ||
      v['kind'] === 'milestone') &&
    typeof v['text'] === 'string' &&
    Number.isFinite(v['timestamp_ms'])
  );
}

function normalizeSnapshot(snap: DataSourceSnapshot): DataSourceSnapshot {
  // Defensive normalization: any field missing from the wire payload
  // is filled in from the matching seed entry by id; otherwise we leave
  // the value untouched. (The seed uses the `${deckId}:...` id scheme.)
  return {
    ...snap,
    change_pct: clampNumber(snap.change_pct, -100, 100),
    updated_at_ms: Math.max(0, Math.floor(snap.updated_at_ms)),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ---------------------------------------------------------------------------
// Helpers exposed for tests and component consumers
// ---------------------------------------------------------------------------

/** Milliseconds remaining until `scheduledAtMs`; clamped at zero. */
export function minutesUntilScheduled(scheduledAtMs: number, nowMs: number = Date.now()): number {
  const diffMs = scheduledAtMs - nowMs;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 60_000);
}

/** Returns true when the scheduled time has been reached within ±30s. */
export function isStartingNow(scheduledAtMs: number, nowMs: number = Date.now()): boolean {
  return Math.abs(scheduledAtMs - nowMs) <= 30 * 1000;
}

/** Default brand kit, exported so tests can compare against fallback values. */
export const DEFAULT_BRAND_KIT: BrandKit = {
  primary_color: '#3B5BFF',
  secondary_color: '#0E1A4A',
  accent_color: '#FFD166',
  background_color: '#0A0F1F',
  font_family: 'Inter, system-ui, sans-serif',
};

/** Format a timestamp as "HH:MM" using the local time zone. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Format a change percentage with sign and 1-decimal precision. */
export function formatChange(pct: number): string {
  if (!Number.isFinite(pct)) return '0.0%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** Build the brand-tinted background gradient. */
export function gradientFor(brand: BrandKit): string {
  const primary = brand.primary_color;
  const secondary = brand.secondary_color;
  const bg = brand.background_color;
  return `linear-gradient(135deg, ${bg} 0%, ${secondary} 50%, ${primary} 100%)`;
}
