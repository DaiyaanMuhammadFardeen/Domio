/**
 * timeline-service — typed client for the per-session event timeline.
 *
 * Per Wave 11 §S11.1 of docs/frontend-roadmap/11-wave-novel-frontier.md:
 *   - Reconstruct every event of a live session (slide advance,
 *     scenario toggle, annotation, poll launch, Q&A submitted,
 *     comments, session start/end).
 *   - Snapshot the dashboard state at every event.
 *   - Diff between two arbitrary events.
 *
 * The wire shape comes from the live-analytics service:
 *   - `GET /v1/sessions/:id`            → SessionInfo
 *   - `GET /v1/sessions/:id/events`     → SessionEvent[]
 *   - `POST /v1/sessions/:id/diff`      → { changes: {field,before,after}[] }
 *
 * On any fetch failure the loader returns deterministic seed data so
 * the dashboard renders something useful during local development and
 * when the live service is down. The seed is keyed by `sessionId` so
 * the same id always produces the same events.
 */

export type SessionEventType =
  | 'slide_advance'
  | 'scenario_toggle'
  | 'annotation'
  | 'poll_launch'
  | 'qa_submitted'
  | 'comment_added'
  | 'session_start'
  | 'session_end';

export type ActorType = 'presenter' | 'audience' | 'system';

export interface SessionEventActor {
  type: ActorType;
  id: string;
  name: string;
}

export interface SessionSnapshot {
  slide_index: number;
  scenarios_active: string[];
  annotations_count: number;
  polls_count: number;
  qa_count: number;
  comments_count: number;
}

export interface SessionEvent {
  id: string;
  timestamp_ms: number;
  type: SessionEventType;
  actor: SessionEventActor;
  summary: string;
  payload: Record<string, unknown>;
  snapshot: SessionSnapshot;
}

export interface SessionInfo {
  id: string;
  deck_id: string;
  deck_title: string;
  presenter_name: string;
  started_at_ms: number;
  ended_at_ms?: number;
  attendee_count: number;
}

export interface EventChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffResult {
  changes: EventChange[];
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['LIVE_ANALYTICS_URL'] : undefined) ??
  'http://localhost:8092';

interface SessionInfoWire {
  id?: string;
  deck_id?: string;
  deck_title?: string;
  presenter_name?: string;
  started_at_ms?: number;
  ended_at_ms?: number;
  attendee_count?: number;
}

interface SessionEventWire {
  id?: string;
  timestamp_ms?: number;
  type?: string;
  actor?: {
    type?: string;
    id?: string;
    name?: string;
  };
  summary?: string;
  payload?: Record<string, unknown>;
  snapshot?: {
    slide_index?: number;
    scenarios_active?: string[];
    annotations_count?: number;
    polls_count?: number;
    qa_count?: number;
    comments_count?: number;
  };
}

const VALID_TYPES: ReadonlyArray<SessionEventType> = [
  'slide_advance',
  'scenario_toggle',
  'annotation',
  'poll_launch',
  'qa_submitted',
  'comment_added',
  'session_start',
  'session_end',
];

function asType(value: string | undefined): SessionEventType {
  return (VALID_TYPES as readonly string[]).includes(value ?? '')
    ? (value as SessionEventType)
    : 'comment_added';
}

function asActorType(value: string | undefined): ActorType {
  if (value === 'presenter' || value === 'audience' || value === 'system') {
    return value;
  }
  return 'system';
}

function snapshotFromWire(wire: SessionEventWire['snapshot']): SessionSnapshot {
  return {
    slide_index: Number(wire?.slide_index ?? 0),
    scenarios_active: Array.isArray(wire?.scenarios_active)
      ? [...(wire!.scenarios_active as string[])]
      : [],
    annotations_count: Number(wire?.annotations_count ?? 0),
    polls_count: Number(wire?.polls_count ?? 0),
    qa_count: Number(wire?.qa_count ?? 0),
    comments_count: Number(wire?.comments_count ?? 0),
  };
}

function eventFromWire(wire: SessionEventWire, fallbackIndex: number): SessionEvent {
  return {
    id: String(wire.id ?? `evt-${fallbackIndex}`),
    timestamp_ms: Number(wire.timestamp_ms ?? 0),
    type: asType(wire.type),
    actor: {
      type: asActorType(wire.actor?.type),
      id: String(wire.actor?.id ?? 'unknown'),
      name: String(wire.actor?.name ?? 'Unknown'),
    },
    summary: String(wire.summary ?? ''),
    payload: wire.payload ?? {},
    snapshot: snapshotFromWire(wire.snapshot),
  };
}

/**
 * Deterministic 32-bit hash from a string. Used to seed the mock data
 * for a session id — same input → same output.
 */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface SeedSession {
  info: SessionInfo;
  events: SessionEvent[];
}

function buildSeedSessions(): ReadonlyArray<SeedSession> {
  const baseMs = Date.parse('2026-08-12T15:00:00Z');
  const decks = [
    { id: 'deck-q3-board', title: 'Q3 board update', presenter: 'Ada Lovelace' },
    {
      id: 'deck-product-launch',
      title: 'Product launch — Domio Studio',
      presenter: 'Grace Hopper',
    },
    { id: 'deck-investor-brief', title: 'Series C investor brief', presenter: 'Linus Torvalds' },
    { id: 'deck-onboard', title: 'New customer onboarding', presenter: 'Margaret Hamilton' },
  ];
  const audienceNames = [
    'Sam Patel',
    'Yui Tanaka',
    'Marco Bianchi',
    'Priya Singh',
    'Esther Wanjiru',
    'Diego Rivera',
    'Mei Lin',
    'Ola Kowalski',
  ];

  return decks.map((deck, deckIdx) => {
    const seed = hashString(deck.id);
    const start = baseMs + deckIdx * 86_400_000 + (seed % 3_600_000);
    const events: SessionEvent[] = [];
    const total = 15 + (seed % 16); // 15-30 events

    let slide = 0;
    const scenarios = new Set<string>(['base']);
    let annotations = 0;
    let polls = 0;
    let qa = 0;
    let comments = 0;
    let cursor = start;

    events.push({
      id: `evt-${deck.id}-0`,
      timestamp_ms: cursor,
      type: 'session_start',
      actor: { type: 'presenter', id: `presenter-${deckIdx}`, name: deck.presenter },
      summary: `Session started for ${deck.title}`,
      payload: { deck_id: deck.id },
      snapshot: {
        slide_index: 0,
        scenarios_active: [...scenarios],
        annotations_count: 0,
        polls_count: 0,
        qa_count: 0,
        comments_count: 0,
      },
    });

    for (let i = 1; i < total - 1; i++) {
      cursor += 20_000 + ((seed + i * 31) % 90_000);
      const variant = (seed + i * 7) % 7;
      const id = `evt-${deck.id}-${i}`;
      const audienceIdx = (seed + i * 13) % audienceNames.length;
      const audienceName = audienceNames[audienceIdx] ?? 'Audience member';

      if (variant === 0) {
        slide = Math.min(slide + 1, 12);
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'slide_advance',
          actor: { type: 'presenter', id: `presenter-${deckIdx}`, name: deck.presenter },
          summary: `Advanced to slide ${slide + 1}`,
          payload: { slide_index: slide, previous_slide_index: slide - 1 },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else if (variant === 1) {
        const scenarioName = ['bear-case', 'bull-case', 'what-if', 'stretch'][i % 4] ?? 'what-if';
        const isOn = (seed + i) % 2 === 0;
        if (isOn) scenarios.add(scenarioName);
        else scenarios.delete(scenarioName);
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'scenario_toggle',
          actor: { type: 'presenter', id: `presenter-${deckIdx}`, name: deck.presenter },
          summary: `Scenario '${scenarioName}' toggled ${isOn ? 'ON' : 'OFF'}`,
          payload: { scenario: scenarioName, state: isOn ? 'on' : 'off' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else if (variant === 2) {
        annotations += 1;
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'annotation',
          actor: { type: 'presenter', id: `presenter-${deckIdx}`, name: deck.presenter },
          summary: `Annotated slide ${slide + 1}`,
          payload: { slide_index: slide, note: 'Highlighted key metric' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else if (variant === 3) {
        polls += 1;
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'poll_launch',
          actor: { type: 'presenter', id: `presenter-${deckIdx}`, name: deck.presenter },
          summary: `Launched poll "What is the priority?"`,
          payload: { poll_id: `poll-${i}`, question: 'What is the priority?' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else if (variant === 4) {
        qa += 1;
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'qa_submitted',
          actor: { type: 'audience', id: `aud-${audienceIdx}`, name: audienceName },
          summary: `${audienceName} submitted a Q&A question`,
          payload: { question: 'Can you expand on the timeline?' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else if (variant === 5) {
        comments += 1;
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'comment_added',
          actor: { type: 'audience', id: `aud-${audienceIdx}`, name: audienceName },
          summary: `${audienceName} commented`,
          payload: { comment: 'Great point!' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      } else {
        events.push({
          id,
          timestamp_ms: cursor,
          type: 'comment_added',
          actor: { type: 'system', id: 'system', name: 'Domio' },
          summary: 'Heartbeat',
          payload: { kind: 'heartbeat' },
          snapshot: {
            slide_index: slide,
            scenarios_active: [...scenarios],
            annotations_count: annotations,
            polls_count: polls,
            qa_count: qa,
            comments_count: comments,
          },
        });
      }
    }

    cursor += 60_000;
    const endedAt = cursor;
    events.push({
      id: `evt-${deck.id}-${total - 1}`,
      timestamp_ms: endedAt,
      type: 'session_end',
      actor: { type: 'system', id: 'system', name: 'Domio' },
      summary: 'Session ended',
      payload: { duration_ms: endedAt - start },
      snapshot: {
        slide_index: slide,
        scenarios_active: [...scenarios],
        annotations_count: annotations,
        polls_count: polls,
        qa_count: qa,
        comments_count: comments,
      },
    });

    const attendeeCount = 8 + (seed % 80);

    return {
      info: {
        id: `session-${deck.id}`,
        deck_id: deck.id,
        deck_title: deck.title,
        presenter_name: deck.presenter,
        started_at_ms: start,
        ended_at_ms: endedAt,
        attendee_count: attendeeCount,
      },
      events,
    };
  });
}

const SEED_SESSIONS: ReadonlyArray<SeedSession> = buildSeedSessions();

export function listSeedSessions(): ReadonlyArray<SessionInfo> {
  return SEED_SESSIONS.map((s) => s.info);
}

function findSeedSession(sessionId: string): SeedSession | null {
  return SEED_SESSIONS.find((s) => s.info.id === sessionId) ?? null;
}

/**
 * Compute a structured diff between two snapshots.
 */
export function diffSnapshots(before: SessionSnapshot, after: SessionSnapshot): EventChange[] {
  const changes: EventChange[] = [];
  if (before.slide_index !== after.slide_index) {
    changes.push({
      field: 'slide_index',
      before: before.slide_index,
      after: after.slide_index,
    });
  }
  const beforeSet = new Set(before.scenarios_active);
  const afterSet = new Set(after.scenarios_active);
  const addedScenarios = [...afterSet].filter((s) => !beforeSet.has(s));
  const removedScenarios = [...beforeSet].filter((s) => !afterSet.has(s));
  if (addedScenarios.length > 0) {
    changes.push({ field: 'scenarios_added', before: [], after: addedScenarios });
  }
  if (removedScenarios.length > 0) {
    changes.push({ field: 'scenarios_removed', before: removedScenarios, after: [] });
  }
  const counters: ReadonlyArray<keyof SessionSnapshot> = [
    'annotations_count',
    'polls_count',
    'qa_count',
    'comments_count',
  ];
  for (const c of counters) {
    if (before[c] !== after[c]) {
      changes.push({ field: c, before: before[c], after: after[c] });
    }
  }
  return changes;
}

/**
 * Fetch the session metadata. Falls back to the deterministic seed
 * for the session id, or the first seeded session when the id is
 * unknown.
 */
export async function getSession(
  sessionId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<SessionInfo | null> {
  const url = new URL(`/v1/sessions/${encodeURIComponent(sessionId)}`, baseUrl);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as SessionInfoWire;
      return {
        id: String(json.id ?? sessionId),
        deck_id: String(json.deck_id ?? ''),
        deck_title: String(json.deck_title ?? ''),
        presenter_name: String(json.presenter_name ?? ''),
        started_at_ms: Number(json.started_at_ms ?? Date.now()),
        ...(typeof json.ended_at_ms === 'number' ? { ended_at_ms: json.ended_at_ms } : {}),
        attendee_count: Number(json.attendee_count ?? 0),
      };
    }
  } catch {
    // fall through to seed
  }
  const seed = findSeedSession(sessionId);
  if (seed) return seed.info;
  return SEED_SESSIONS[0]?.info ?? null;
}

/**
 * List every event of a session, ordered by timestamp ascending.
 */
export async function listSessionEvents(
  sessionId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<SessionEvent[]> {
  const url = new URL(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, baseUrl);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { events?: SessionEventWire[] };
      const events = (json.events ?? []).map((e, i) => eventFromWire(e, i));
      events.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      return events;
    }
  } catch {
    // fall through to seed
  }
  let seed = findSeedSession(sessionId);
  if (!seed && SEED_SESSIONS.length > 0) {
    seed = SEED_SESSIONS[0] ?? null;
  }
  if (!seed) return [];
  return seed.events.map((e) => ({
    ...e,
    snapshot: { ...e.snapshot, scenarios_active: [...e.snapshot.scenarios_active] },
  }));
}

/**
 * Compute a structured diff between two events of a session. The
 * returned changes describe exactly what shifted in the state
 * snapshot between the two points in time.
 */
export async function diffEvents(
  sessionId: string,
  fromId: string,
  toId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<DiffResult> {
  const url = new URL(`/v1/sessions/${encodeURIComponent(sessionId)}/diff`, baseUrl);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from_id: fromId, to_id: toId }),
    });
    if (res.ok) {
      const json = (await res.json()) as { changes?: EventChange[] };
      return { changes: Array.isArray(json.changes) ? [...json.changes] : [] };
    }
  } catch {
    // fall through to local computation
  }
  const events = await listSessionEvents(sessionId, baseUrl);
  const from = events.find((e) => e.id === fromId);
  const to = events.find((e) => e.id === toId);
  if (!from || !to) return { changes: [] };
  return { changes: diffSnapshots(from.snapshot, to.snapshot) };
}
