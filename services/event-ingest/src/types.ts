/**
 * Event-ingest — types & constants (Phase 17 W1).
 *
 * The ingest edge receives two kinds of input:
 *   1. HTTP POST /v1/events — signed batches from browsers (analytics-sdk).
 *   2. NATS subject analytics.ingest.live.{sessionID} — fan-out from rtgw/pwg.
 *
 * Both shapes reduce to a canonical AnalyticsEvent (see
 * packages/analytics-sdk/src/types.ts), and both are forwarded to Kafka
 * topic `events.ingest.raw` with partition key
 * `${workspace_id}:${viewer_id_key}` so sessionization in W4 has a
 * single per-viewer ordering invariant.
 */

/** The canonical Kafka topic for raw events. */
export const KAFKA_TOPIC_RAW = 'events.ingest.raw';

/** The canonical Kafka topic for dead-letter events. */
export const KAFKA_TOPIC_DLQ = 'events.ingest.dlq';

/** The Kafka subject prefix the clickhouse-loader consumes. */
export const CLICKHOUSE_TOPIC_PATTERN = 'events.ingest.raw';

/**
 * NATS subject pattern this service subscribes to for live session
 * fan-out from rtgw/pwg. Wildcards are required so a single subscription
 * sees every session ID.
 */
export const NATS_LIVE_SUBJECT = 'analytics.ingest.live.*';

/**
 * The six event names the ingest plane accepts. Mirrors the JSON
 * Schemas under contracts/events/ingest/.
 */
export const EVENT_NAMES = [
  'view',
  'interaction',
  'scroll_progress',
  'scroll_pause',
  'presenter_event',
  'live_session_event',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Privacy modes — must stay in sync with packages/analytics-sdk. */
export type PrivacyMode = 'identified' | 'pseudonymous' | 'anon_consent' | 'anon_no_track';

/** Device classes. */
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot';

/** Region pinning for Bangladesh residency (W9). */
export type RegionPin = 'global' | 'bd';

/** Source apps that emit events. */
export type SourceApp = 'viewer' | 'presenter' | 'join-web' | 'rtgw' | 'pwg';

/**
 * Canonical ingest envelope — written to Kafka after validation, PII
 * stripping, and HMAC verification. The shape mirrors
 * packages/analytics-sdk/src/types.ts AnalyticsEvent (without the
 * SDK-specific ts_ms / source_app / etc. that we re-stamp here).
 */
export interface AnalyticsEvent {
  event_id: string;
  event_name: EventName;
  schema_version: 1;
  ts_ms: number;
  workspace_id: string;
  deck_id: string;
  slide_id?: string;
  scene_node_id?: string;
  viewer_id_key: string;
  session_id?: string;
  experiment_id?: string;
  variant_id?: string;
  privacy_mode: PrivacyMode;
  device_class: DeviceClass;
  ua_family?: string;
  os_family?: string;
  referer_host?: string;
  country_iso?: string;
  region_pinned?: RegionPin;
  share_link_id?: string;
  source_app: SourceApp;
  ingest_topic: 'events.ingest.raw';
  forward_compat?: boolean;
  // Event-specific fields:
  interaction_kind?: string;
  interaction_data?: string;
  value_numeric?: number;
  value_text?: string;
  dwell_ms?: number;
  scroll_depth?: number;
  tile_x?: number;
  tile_y?: number;
  viewport_height_px?: number;
  scroll_velocity_px_per_s?: number;
  presenter_user_id?: string;
  action?: string;
  action_data?: string;
  co_presenter_user_id?: string;
  annotation_id?: string;
  live_event_kind?: string;
  live_event_data?: string;
  payload_size_bytes?: number;
  latency_ms?: number;
}

/**
 * A signed batch from the analytics-sdk. The HMAC signature covers
 * the raw body bytes (not the JSON-parsed object) so we verify before
 * parsing — see routes/events.ts.
 */
export interface SignedBatch {
  body: string;
  signature: string; // X-Domio-Signature: sha256=<hex>
  timestamp: string; // X-Domio-Timestamp (unix ms)
  nonce: string; // X-Domio-Nonce (16-byte hex)
  contentType: string;
}

/**
 * Result of validating + accepting a batch. Returned to the caller
 * with the assigned seq numbers for traceability.
 */
export interface IngestAck {
  accepted: number;
  rejected: number;
  spooled: number;
  seq_start: number;
  seq_end: number;
}

/** Status of a single event after validation. */
export type EventStatus =
  | { ok: true; event: AnalyticsEvent; seq: number }
  | { ok: false; reason: 'pii' | 'schema' | 'consent' | 'duplicate'; message: string };

/**
 * Minimal service configuration — every value comes from env at boot.
 */
export interface IngestConfig {
  port: number;
  /** HMAC shared key (hex-encoded). */
  hmacKeyHex: string;
  /** Redis URL for the nonce replay cache (set to "memory" for tests). */
  redisUrl: string;
  /** Kafka brokers (comma-separated host:port). */
  kafkaBrokers: string[];
  /** NATS URL for the analytics.ingest.live.* subscription. */
  natsUrl: string;
  /** Disk spool directory when Kafka is unreachable. */
  spoolDir: string;
  /** Maximum events in flight per request. */
  maxBatchSize: number;
  /** Maximum bytes per request (default 256 KB). */
  maxBatchBytes: number;
  /** Maximum accepted ts skew vs server clock. */
  maxClockSkewMs: number;
  /** Replay nonce TTL. */
  nonceTtlMs: number;
  /** Privacy modes that we accept (others are rejected with consent). */
  acceptPrivacyModes: readonly PrivacyMode[];
}

/**
 * Build a default IngestConfig from process.env. Used by main(); tests
 * construct their own config explicitly.
 */
export function loadConfigFromEnv(): IngestConfig {
  const port = Number(process.env.PORT ?? 8787);
  const hmacKeyHex = process.env.INGEST_HMAC_KEY_HEX ?? '';
  const redisUrl = process.env.INGEST_REDIS_URL ?? 'memory';
  const kafkaBrokers = (process.env.INGEST_KAFKA_BROKERS ?? 'localhost:9092')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const natsUrl = process.env.INGEST_NATS_URL ?? 'nats://localhost:4222';
  const spoolDir = process.env.INGEST_SPOOL_DIR ?? '/var/lib/domio/event-ingest/spool';
  const maxBatchSize = Number(process.env.INGEST_MAX_BATCH_SIZE ?? 200);
  const maxBatchBytes = Number(process.env.INGEST_MAX_BATCH_BYTES ?? 256 * 1024);
  const maxClockSkewMs = Number(process.env.INGEST_MAX_CLOCK_SKEW_MS ?? 60_000);
  const nonceTtlMs = Number(process.env.INGEST_NONCE_TTL_MS ?? 5 * 60_000);
  const acceptPrivacyModes: readonly PrivacyMode[] = ['identified', 'pseudonymous', 'anon_consent'];

  return {
    port,
    hmacKeyHex,
    redisUrl,
    kafkaBrokers,
    natsUrl,
    spoolDir,
    maxBatchSize,
    maxBatchBytes,
    maxClockSkewMs,
    nonceTtlMs,
    acceptPrivacyModes,
  };
}
