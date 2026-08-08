/**
 * Live-analytics — post-session summary writer (Phase 17 W10).
 *
 * Drains the ring buffer for a session, derives the summary via
 * `deriveSummary`, and INSERTs a single row into ClickHouse
 * `live_session_summary`. Designed to be called when a session ends
 * (presenter signals end-of-session) or when the idle flusher evicts
 * a stale session.
 */

import type { ClickHouseClient } from '../store/clickhouse.js';
import type { RingBuffer } from '../store/ring_buffer.js';
import { deriveSummary } from '../pulse/derive.js';
import type { LiveSessionSummary } from '../types.js';

export interface SummarySink {
  /** Drain the buffer for one session and persist a summary row. Returns null if empty. */
  flushOne(workspace_id: string, session_id: string, deck_id: string): Promise<LiveSessionSummary | null>;
}

export function buildSummarySink(ch: ClickHouseClient, buffer: RingBuffer): SummarySink {
  return {
    async flushOne(workspace_id, session_id, deck_id) {
      const events = buffer.snapshot(workspace_id, session_id);
      if (events.length === 0) return null;
      const summary = deriveSummary(events);
      const row: LiveSessionSummary = {
        workspace_id,
        session_id,
        deck_id,
        ...summary,
      };
      await ch.execute(
        `INSERT INTO live_session_summary
          (workspace_id, session_id, deck_id, started_at_ms, ended_at_ms, duration_ms,
           peak_concurrent_viewers, total_events, total_reactions, total_poll_votes,
           total_annotations, unique_viewers, average_dwell_ms)
         VALUES
          ({workspace_id:String}, {session_id:String}, {deck_id:String},
           {started_at_ms:DateTime64(3)}, {ended_at_ms:DateTime64(3)}, {duration_ms:Int64},
           {peak_concurrent_viewers:UInt32}, {total_events:UInt32}, {total_reactions:UInt32},
           {total_poll_votes:UInt32}, {total_annotations:UInt32}, {unique_viewers:UInt32},
           {average_dwell_ms:Int32})`,
        {
          workspace_id: row.workspace_id,
          session_id: row.session_id,
          deck_id: row.deck_id,
          started_at_ms: toDateTime(row.started_at_ms),
          ended_at_ms: toDateTime(row.ended_at_ms),
          duration_ms: row.duration_ms,
          peak_concurrent_viewers: row.peak_concurrent_viewers,
          total_events: row.total_events,
          total_reactions: row.total_reactions,
          total_poll_votes: row.total_poll_votes,
          total_annotations: row.total_annotations,
          unique_viewers: row.unique_viewers,
          average_dwell_ms: row.average_dwell_ms,
        },
      );
      buffer.drop(workspace_id, session_id);
      return row;
    },
  };
}

function toDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}