/**
 * Sessionization — shared types (Phase 17 W4).
 *
 * A "session" is a 30-minute inactivity window of events from the same
 * viewer_id_key. The sessionization service reads events from Kafka
 * topic `events.ingest.raw` (partitioned by
 * `${workspace_id}:${viewer_id_key}` for ordering) and emits
 * session.started / session.heartbeat / session.ended events.
 *
 * Sessions are also written to ClickHouse `sessions_long` for the
 * warehouse rollups.
 */

import type { AnalyticsEvent } from '@domio/event-ingest';

export interface SessionConfig {
  port: number;
  /** Inactivity gap that closes a session. Default 30 minutes. */
  inactivityMs: number;
  /** Hard upper bound on a single session. Default 4 hours. */
  maxSessionMs: number;
  /** Kafka brokers. */
  kafkaBrokers: string[];
  /** Topic to consume from (raw events). */
  topicRaw: string;
  /** ClickHouse HTTP endpoint. */
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
  /** When false, ClickHouse writes are disabled. */
  writeToClickHouse: boolean;
}

export function loadConfigFromEnv(): SessionConfig {
  const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: Number(process.env['PORT'] ?? '3051'),
    inactivityMs: Number(process.env['SESSION_INACTIVITY_MS'] ?? 30 * 60 * 1000),
    maxSessionMs: Number(process.env['SESSION_MAX_MS'] ?? 4 * 60 * 60 * 1000),
    kafkaBrokers: brokers,
    topicRaw: process.env['SESSION_TOPIC_RAW'] ?? 'events.ingest.raw',
    clickhouseUrl: process.env['CLICKHOUSE_URL'] ?? '',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
    writeToClickHouse: process.env['SESSION_WRITE_CH'] === 'true',
  };
}

export type SessionState = 'open' | 'closed';

export interface SessionRecord {
  session_id: string;
  workspace_id: string;
  viewer_id_key: string;
  deck_id: string;
  state: SessionState;
  started_at_ms: number;
  last_event_at_ms: number;
  ended_at_ms: number | null;
  event_count: number;
  source_app: AnalyticsEvent['source_app'];
  privacy_mode: AnalyticsEvent['privacy_mode'];
  device_class: AnalyticsEvent['device_class'];
  region_pinned: AnalyticsEvent['region_pinned'] | null;
  country_iso: string | null;
}

export type SessionCloseReason = 'inactivity' | 'max_duration' | 'evict';

export type SessionEvent =
  | { type: 'session.started'; session: SessionRecord }
  | { type: 'session.heartbeat'; session: SessionRecord }
  | { type: 'session.ended'; session: SessionRecord; reason: SessionCloseReason };
