/**
 * Sessionization — ClickHouse writer for sessions (Phase 17 W4).
 *
 * Mirrors the open/closed session state to ClickHouse
 * `sessions_long` (ReplacingMergeTree) so the warehouse can answer
 * "how many sessions closed in the last 24h" cheaply.
 */

import type { SessionRecord } from '../types.js';

export interface SessionWriterClient {
  execute(sql: string, params?: Record<string, unknown>): Promise<void>;
}

export interface SessionSink {
  upsert(s: SessionRecord): Promise<void>;
}

export function buildSessionSink(client: SessionWriterClient): SessionSink {
  return {
    async upsert(s) {
      await client.execute(
        `INSERT INTO sessions_long
          (session_id, workspace_id, viewer_id_key, deck_id, source_app, privacy_mode, device_class, region_pinned, country_iso, started_at_ms, last_event_at_ms, ended_at_ms, event_count, state)
         VALUES ({session_id:String}, {workspace_id:String}, {viewer_id_key:String}, {deck_id:String}, {source_app:String}, {privacy_mode:String}, {device_class:String}, {region_pinned:String}, {country_iso:String}, {started_at_ms:DateTime64(3)}, {last_event_at_ms:DateTime64(3)}, {ended_at_ms:Nullable(DateTime64(3))}, {event_count:UInt32}, {state:String})`,
        {
          session_id: s.session_id,
          workspace_id: s.workspace_id,
          viewer_id_key: s.viewer_id_key,
          deck_id: s.deck_id,
          source_app: s.source_app,
          privacy_mode: s.privacy_mode,
          device_class: s.device_class,
          region_pinned: s.region_pinned ?? '',
          country_iso: s.country_iso ?? '',
          started_at_ms: toDateTime64(s.started_at_ms),
          last_event_at_ms: toDateTime64(s.last_event_at_ms),
          ended_at_ms: s.ended_at_ms === null ? null : toDateTime64(s.ended_at_ms),
          event_count: s.event_count,
          state: s.state,
        },
      );
    },
  };
}

function toDateTime64(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}