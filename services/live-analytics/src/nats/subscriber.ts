/**
 * Live-analytics — NATS JetStream subscriber (Phase 17 W10).
 *
 * Mirrors the bridge in services/event-ingest/src/nats_bridge.ts but
 * for the live subject pattern. Each message body is the JSON
 * envelope produced by rtgw/pwg on `analytics.ingest.live.{sessionID}`.
 * We normalize to the LiveEvent shape and hand it off to the
 * orchestrator for fan-out to the ring buffer, pulse broadcaster, and
 * summary sink.
 */

import type { LiveEvent, LiveEventKind } from '../types.js';

export const NATS_LIVE_SUBJECT = 'analytics.ingest.live.*';

export interface SubscriberMessage {
  raw: Uint8Array;
  subject: string;
}

export interface NatsSubscriber {
  start(handler: (event: LiveEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  received(): number;
  forwarded(): number;
}

interface NatsModule {
  connect: (url: string, opts?: Record<string, unknown>) => Promise<NatsConnection>;
}

interface NatsConnection {
  subscribe: (subject: string, opts?: Record<string, unknown>) => Promise<NatsSubscription>;
  drain: () => Promise<void>;
  close: () => void;
  isClosed: () => boolean;
}

interface NatsSubscription {
  unsubscribe: () => void;
}

export async function buildNatsSubscriber(url: string): Promise<NatsSubscriber> {
  const nats = (await import('nats')) as unknown as NatsModule;
  let conn: NatsConnection | null = null;
  let sub: NatsSubscription | null = null;
  let counter = { received: 0, forwarded: 0 };

  return {
    received() {
      return counter.received;
    },
    forwarded() {
      return counter.forwarded;
    },
    async start(handler) {
      if (conn) return;
      conn = await nats.connect(url, { name: 'live-analytics' });
      sub = await conn.subscribe(NATS_LIVE_SUBJECT, { queue: 'live-analytics' });
      void (async () => {
        if (!sub) return;
        // The for-await iterator on a JetStream subscription yields
        // `{ raw, subject }` shaped messages; we keep the type as
        // `unknown` so we don't pull in @types/nats just for the
        // generator shape. The normalization in normalizeLiveEvent()
        // is the contract.
        const iter = sub as unknown as AsyncIterable<{ raw: Uint8Array; subject: string }>;
        for await (const m of iter) {
          counter.received += 1;
          try {
            const json = JSON.parse(new TextDecoder().decode(m.raw));
            const sessionId = extractSessionId(m.subject);
            const event = normalizeLiveEvent(json, sessionId);
            await handler(event);
            counter.forwarded += 1;
          } catch {
            // drop malformed events; we surface counter deltas only.
          }
        }
      })();
    },
    async stop() {
      if (sub) {
        sub.unsubscribe();
        sub = null;
      }
      if (conn) {
        try {
          await conn.drain();
        } catch {
          conn.close();
        }
        conn = null;
      }
    },
  };
}

function extractSessionId(subject: string): string {
  // analytics.ingest.live.{sessionID}
  const parts = subject.split('.');
  return parts[parts.length - 1] ?? '';
}

interface UnknownRec {
  [k: string]: unknown;
}

const KNOWN_KINDS: readonly LiveEventKind[] = [
  'viewer_join',
  'viewer_leave',
  'slide_change',
  'reaction',
  'annotation',
  'presenter_action',
  'chat',
  'poll_vote',
  'heartbeat',
];

export function normalizeLiveEvent(raw: unknown, sessionIdFromSubject: string): LiveEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('nats live message body must be a JSON object');
  }
  const r = raw as UnknownRec;
  const kindRaw = String(r['live_event_kind'] ?? r['kind'] ?? 'heartbeat');
  const kind: LiveEventKind = KNOWN_KINDS.includes(kindRaw as LiveEventKind)
    ? (kindRaw as LiveEventKind)
    : 'heartbeat';
  let data: string | undefined;
  const liveEventData = r['live_event_data'];
  if (typeof liveEventData === 'string') {
    try {
      const decoded = Buffer.from(liveEventData, 'base64').toString('utf-8');
      data = decoded;
    } catch {
      data = liveEventData;
    }
  } else if (typeof r['data'] === 'string') {
    data = r['data'] as string;
  }
  const sessionId = String(r['session_id'] ?? sessionIdFromSubject);
  const seq = Number(r['seq'] ?? r['sequence'] ?? 0);
  const ts_ms = Number(r['ts_ms'] ?? Date.now());
  const viewerIdKey = String(r['viewer_id_key'] ?? r['participant_id'] ?? '');
  const valueNumericRaw = r['value_numeric'];
  const value_numeric = typeof valueNumericRaw === 'number' ? valueNumericRaw : undefined;
  return {
    seq,
    ts_ms,
    workspace_id: String(r['workspace_id'] ?? ''),
    session_id: sessionId,
    deck_id: String(r['deck_id'] ?? ''),
    viewer_id_key: viewerIdKey,
    kind,
    ...(data !== undefined ? { data } : {}),
    ...(value_numeric !== undefined ? { value_numeric } : {}),
  };
}

/** In-memory NATS subscriber for tests. */
export interface InMemoryNatsSubscriber extends NatsSubscriber {
  publishTest(event: LiveEvent): Promise<void>;
  handler: ((event: LiveEvent) => Promise<void>) | null;
}

export function buildInMemoryNatsSubscriber(): InMemoryNatsSubscriber {
  const bridge: InMemoryNatsSubscriber = {
    handler: null,
    received() {
      return 0;
    },
    forwarded() {
      return 0;
    },
    async start(handler) {
      this.handler = handler;
    },
    async stop() {
      this.handler = null;
    },
    async publishTest(event) {
      if (!this.handler) throw new Error('subscriber not started');
      await this.handler(event);
    },
  };
  return bridge;
}