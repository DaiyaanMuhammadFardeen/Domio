/**
 * apps/presenter — Gesture service.
 *
 * Per Wave 11 §S11.4 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Types + in-memory persistence for the presenter's gesture control
 * feature. The runtime is local: webcam frames are processed in the
 * browser via MediaPipe (lazy-loaded only when the presenter enables
 * gesture control). The registry maps detected gestures to slide
 * actions — defaults ship sane, the editor lets the presenter remap.
 *
 * Server-side persistence lands in a follow-up; for now all reads /
 * writes go to an in-memory store so the editor and detector round-trip
 * cleanly in development and tests.
 */

export type GestureKind =
  | 'open_palm'
  | 'fist'
  | 'swipe_left'
  | 'swipe_right'
  | 'thumbs_up'
  | 'peace_sign';

export type GestureAction =
  | 'advance'
  | 'back'
  | 'next_section'
  | 'prev_section'
  | 'start_poll'
  | 'end_poll'
  | 'mute'
  | 'unmute';

export const ALL_GESTURE_KINDS: ReadonlyArray<GestureKind> = [
  'open_palm',
  'fist',
  'swipe_left',
  'swipe_right',
  'thumbs_up',
  'peace_sign',
];

export const ALL_GESTURE_ACTIONS: ReadonlyArray<GestureAction> = [
  'advance',
  'back',
  'next_section',
  'prev_section',
  'start_poll',
  'end_poll',
  'mute',
  'unmute',
];

/** Default map: open palm advances, fist retreats, swipe jumps section,
 *  thumbs up starts a poll, peace sign ends a poll. */
export const DEFAULT_GESTURE_MAP: Record<GestureKind, GestureAction> = {
  open_palm: 'advance',
  fist: 'back',
  swipe_left: 'prev_section',
  swipe_right: 'next_section',
  thumbs_up: 'start_poll',
  peace_sign: 'end_poll',
};

export interface GestureMap {
  id: string;
  session_id: string;
  mappings: Record<GestureKind, GestureAction>;
}

export interface GestureEvent {
  id: string;
  timestamp_ms: number;
  gesture: GestureKind;
  confidence: number;
  action: GestureAction | null;
}

/* ----------------------------- in-memory store ----------------------------- */

interface Store {
  /** session_id -> GestureMap */
  maps: Map<string, GestureMap>;
  /** session_id -> GestureEvent[] (chronological) */
  events: Map<string, GestureEvent[]>;
  /** monotonic counter so each map / event gets a stable id. */
  nextId: number;
}

const globalAny = globalThis as { __domioGestureStore?: Store };

function getStore(): Store {
  if (!globalAny.__domioGestureStore) {
    globalAny.__domioGestureStore = {
      maps: new Map(),
      events: new Map(),
      nextId: 1,
    };
  }
  return globalAny.__domioGestureStore;
}

function nextId(prefix: string): string {
  const store = getStore();
  const id = store.nextId++;
  return `${prefix}_${id.toString(36)}`;
}

function isGestureKind(value: string): value is GestureKind {
  return (ALL_GESTURE_KINDS as ReadonlyArray<string>).includes(value);
}

function isGestureAction(value: string): value is GestureAction {
  return (ALL_GESTURE_ACTIONS as ReadonlyArray<string>).includes(value);
}

/** Coerce an arbitrary record into a well-formed GestureMap, dropping
 *  unknown keys / values and falling back to the default map for any
 *  missing gesture. */
function coerceMappings(
  input: Readonly<Record<string, unknown>>,
): Record<GestureKind, GestureAction> {
  const out: Record<GestureKind, GestureAction> = { ...DEFAULT_GESTURE_MAP };
  for (const [key, value] of Object.entries(input)) {
    if (!isGestureKind(key)) continue;
    if (typeof value !== 'string' || !isGestureAction(value)) continue;
    out[key] = value;
  }
  return out;
}

function clampConfidence(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/* ------------------------------- public API ------------------------------- */

/**
 * Fetch the gesture map for a session. Returns a freshly minted default
 * map the first time a session is seen.
 */
export async function getGestureMap(sessionId: string): Promise<GestureMap> {
  const store = getStore();
  const existing = store.maps.get(sessionId);
  if (existing) return existing;
  const fresh: GestureMap = {
    id: nextId('gmap'),
    session_id: sessionId,
    mappings: { ...DEFAULT_GESTURE_MAP },
  };
  store.maps.set(sessionId, fresh);
  return fresh;
}

/**
 * Save (overwrite) the gesture map for a session. Re-uses the existing
 * id when one is already known so edits stay idempotent.
 */
export async function saveGestureMap(map: GestureMap): Promise<GestureMap> {
  const store = getStore();
  const existing = store.maps.get(map.session_id);
  const normalized: GestureMap = {
    id: existing?.id ?? map.id ?? nextId('gmap'),
    session_id: map.session_id,
    mappings: coerceMappings(
      (map.mappings ?? {}) as Readonly<Record<string, unknown>>,
    ),
  };
  store.maps.set(normalized.session_id, normalized);
  return normalized;
}

/** Record a single gesture detection for a session. Best-effort:
 *  ignores unknown gestures and clamps confidence. */
export async function recordGestureEvent(
  sessionId: string,
  event: GestureEvent,
): Promise<void> {
  if (!isGestureKind(event.gesture)) return;
  const store = getStore();
  const list = store.events.get(sessionId) ?? [];
  list.push({
    id: event.id || nextId('gev'),
    timestamp_ms: event.timestamp_ms,
    gesture: event.gesture,
    confidence: clampConfidence(event.confidence),
    action: event.action ?? null,
  });
  // Cap the buffer to a reasonable size so we don't leak in long sessions.
  if (list.length > 1024) list.splice(0, list.length - 1024);
  store.events.set(sessionId, list);
}

/** List events for a session, optionally filtered to events since a
 *  given epoch ms (inclusive). Sorted by timestamp ascending. */
export async function listGestureEvents(
  sessionId: string,
  sinceMs?: number,
): Promise<GestureEvent[]> {
  const store = getStore();
  const list = store.events.get(sessionId) ?? [];
  const filtered = typeof sinceMs === 'number'
    ? list.filter((e) => e.timestamp_ms >= sinceMs)
    : list;
  return [...filtered].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
}

/** Resolve the action for a detected gesture using the registry, or
 *  null if the gesture isn't mapped. Convenience for callers that
 *  already have a GestureMap in hand. */
export function resolveAction(
  map: Pick<GestureMap, 'mappings'>,
  gesture: GestureKind,
): GestureAction | null {
  return map.mappings[gesture] ?? null;
}

/** Build the full default map for a brand-new session. Exposed so the
 *  editor can offer a "reset to defaults" affordance. */
export function defaultMappings(): Record<GestureKind, GestureAction> {
  return { ...DEFAULT_GESTURE_MAP };
}

/** Test helper — clear every session's map + event buffer. */
export function __resetGestureServiceState(): void {
  const store = getStore();
  store.maps.clear();
  store.events.clear();
  store.nextId = 1;
}
