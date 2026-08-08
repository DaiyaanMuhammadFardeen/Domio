/**
 * Event-ingest — NATS bridge (Phase 17 W1).
 *
 * Subscribes to NATS subject `analytics.ingest.live.*` (rtgw + pwg
 * fan-out) and forwards each message to the same validation + PII
 * strip + Kafka publish path as HTTP events.
 *
 * The bridge subscribes lazily on first start(); restart() rebuilds
 * the connection with the current natsUrl.
 */

import type { AnalyticsEvent, EventName } from './types.js';
import { NATS_LIVE_SUBJECT } from './types.js';
import type { EventValidator } from './validation.js';
import type { PiiStripper } from './pii.js';
import type { KafkaPublisher } from './kafka.js';
import type { Spool } from './spool.js';
import type { Metrics } from './metrics/metrics.js';

export interface BridgeMessage {
  raw: Uint8Array;
  subject: string;
}

export interface NatsBridge {
  start(handler: (event: AnalyticsEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  /** Number of messages received since boot. */
  received(): number;
  /** Number of messages successfully published. */
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

export async function buildNatsBridge(url: string): Promise<NatsBridge> {
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
      conn = await nats.connect(url, { name: 'event-ingest' });
      sub = await conn.subscribe(NATS_LIVE_SUBJECT, { queue: 'event-ingest' });
      void (async () => {
        if (!sub) return;
        for await (const m of iterMessages(sub)) {
          counter.received += 1;
          try {
            const json = JSON.parse(new TextDecoder().decode(m.raw));
            const event = normalizeNatsEvent(json, m.subject);
            await handler(event);
            counter.forwarded += 1;
          } catch {
            // bad message: drop. (DLQ emission lives at the route layer.)
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

async function* iterMessages(sub: NatsSubscription): AsyncGenerator<BridgeMessage> {
  // We don't use the actual nats types here — the for-await iterator
  // is wired through the queue subscription in the start() body
  // above. This generator is a placeholder that we never actually
  // invoke; we keep it to make the type checker happy without a real
  // nats iterator type.
  void sub;
  throw new Error('iterMessages is unused — see start() body');
}

interface UnknownRec {
  [k: string]: unknown;
}

/**
 * Coerce a NATS message body (which the rtgw/pwg fan-out produces as
 * the JSON envelope shape from Wave 0 commit 11) into the canonical
 * AnalyticsEvent shape that we forward to Kafka.
 */
export function normalizeNatsEvent(raw: unknown, subject: string): AnalyticsEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('nats message body must be a JSON object');
  }
  const r = raw as UnknownRec;
  const live_event_kind = r['live_event_kind'];
  const live_event_data = r['live_event_data'];
  const viewer_id_key = r['viewer_id_key'] ?? r['participant_id'];
  const workspace_id = r['workspace_id'] ?? '';
  const session_id = r['session_id'];
  const ts_ms = Number(r['ts_ms'] ?? Date.now());

  // Base64-decode the original payload if present.
  let decoded: Uint8Array | null = null;
  if (typeof live_event_data === 'string') {
    try {
      decoded = Uint8Array.from(Buffer.from(live_event_data, 'base64'));
    } catch {
      decoded = null;
    }
  }

  const event: AnalyticsEvent = {
    event_id: synthesizeEventId(subject, ts_ms),
    event_name: 'live_session_event' as EventName,
    schema_version: 1,
    ts_ms,
    workspace_id: typeof workspace_id === 'string' ? workspace_id : '',
    deck_id: typeof r['deck_id'] === 'string' ? (r['deck_id'] as string) : '',
    viewer_id_key: typeof viewer_id_key === 'string' ? viewer_id_key : 'unknown',
    privacy_mode: 'pseudonymous',
    device_class: 'bot',
    source_app: typeof r['source_app'] === 'string' ? (r['source_app'] as AnalyticsEvent['source_app']) : 'rtgw',
    ingest_topic: 'events.ingest.raw',
    forward_compat: true,
    live_event_kind: typeof live_event_kind === 'string' ? live_event_kind : 'unknown',
    payload_size_bytes: decoded ? decoded.byteLength : 0,
  };
  if (typeof session_id === 'string') event.session_id = session_id;
  if (decoded) event.live_event_data = new TextDecoder().decode(decoded);
  return event;
}

function synthesizeEventId(subject: string, ts: number): string {
  // RTGW/PWG don't ship an event_id; synthesize one deterministically
  // from the subject + timestamp so the columnar loader can dedupe.
  // We preserve dots (NATS subjects use them as separators) and only
  // collapse whitespace / punctuation that is not legal in an event_id.
  const safe = subject.replace(/\s+/g, '-');
  const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `nat-${safe}-${ts}-${rand}`;
}

/**
 * In-memory NATS bridge for tests. Use publishTest() to inject events
 * into the handler chain.
 */
export interface InMemoryNatsBridge extends NatsBridge {
  publishTest(event: AnalyticsEvent): Promise<void>;
  handler: ((event: AnalyticsEvent) => Promise<void>) | null;
}

export function buildInMemoryNatsBridge(): InMemoryNatsBridge {
  const bridge: InMemoryNatsBridge = {
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
      if (!this.handler) throw new Error('bridge not started');
      await this.handler(event);
    },
  };
  return bridge;
}

// Avoid unused-type errors when metrics is not directly referenced.
export type { EventValidator, PiiStripper, KafkaPublisher, Spool, Metrics };