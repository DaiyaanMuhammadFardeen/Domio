/**
 * Live-analytics — shared types (Phase 17 W10).
 *
 * The service consumes the NATS JetStream subject
 * `analytics.ingest.live.*` that rtgw/pwg fan out to. Each message
 * carries a single live event for a session. We hold the last N
 * events per session in a ring buffer so the WebSocket HUD can
 * replay the trailing window when a new client subscribes.
 */

/** Match the analytics-sdk `live_event_kind` enum produced by rtgw/pwg. */
export type LiveEventKind =
  | 'viewer_join'
  | 'viewer_leave'
  | 'slide_change'
  | 'reaction'
  | 'annotation'
  | 'presenter_action'
  | 'chat'
  | 'poll_vote'
  | 'heartbeat';

export interface LiveEvent {
  /** Monotonically increasing inside a session, assigned by the rtgw. */
  seq: number;
  /** Wall-clock ms when the event was emitted by the gateway. */
  ts_ms: number;
  /** Workspace / tenant boundary. */
  workspace_id: string;
  /** Session identifier — matches the NATS subject suffix. */
  session_id: string;
  /** The deck the session is presenting. */
  deck_id: string;
  /** Viewer who produced the event (empty for presenter-side events). */
  viewer_id_key: string;
  /** Categorical event type. */
  kind: LiveEventKind;
  /** Free-form payload (already base64-decoded upstream). */
  data?: string;
  /** Convenience numeric (e.g. dwell_ms, reaction value). */
  value_numeric?: number;
}

export interface LiveAnalyticsConfig {
  port: number;
  /** NATS URL for the analytics.ingest.live.* subscription. */
  natsUrl: string;
  /** ClickHouse HTTP endpoint. */
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
  /** Ring buffer size per session. Default 500. */
  ringBufferSize: number;
  /** ClickHouse writes are skipped when false. */
  writeToClickHouse: boolean;
  /** Idle threshold (ms) after which a session is auto-closed. */
  sessionIdleMs: number;
}

export function loadConfigFromEnv(): LiveAnalyticsConfig {
  return {
    port: Number(process.env['PORT'] ?? '3070'),
    natsUrl: process.env['NATS_URL'] ?? 'nats://localhost:4222',
    clickhouseUrl: process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
    ringBufferSize: Number(process.env['LIVE_RING_SIZE'] ?? 500),
    writeToClickHouse: process.env['LIVE_WRITE_CH'] !== 'false',
    sessionIdleMs: Number(process.env['LIVE_SESSION_IDLE_MS'] ?? 5 * 60 * 1000),
  };
}

/** A real-time KPI snapshot — broadcast to HUD subscribers. */
export interface LivePulse {
  workspace_id: string;
  session_id: string;
  ts_ms: number;
  /** Current concurrent viewer count. */
  concurrent_viewers: number;
  /** Slide the majority of viewers are currently looking at. */
  current_slide_id: string | null;
  /** Cumulative reaction count since session start. */
  reaction_count: number;
  /** Cumulative poll votes. */
  poll_vote_count: number;
  /** Last event sequence number applied. */
  last_seq: number;
}

/** A single row written to ClickHouse after session end. */
export interface LiveSessionSummary {
  workspace_id: string;
  session_id: string;
  deck_id: string;
  started_at_ms: number;
  ended_at_ms: number;
  duration_ms: number;
  peak_concurrent_viewers: number;
  total_events: number;
  total_reactions: number;
  total_poll_votes: number;
  total_annotations: number;
  unique_viewers: number;
  average_dwell_ms: number;
}
