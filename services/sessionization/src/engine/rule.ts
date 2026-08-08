/**
 * Sessionization — inactivity rule engine (Phase 17 W4).
 *
 * Given a stream of events ordered by `ts_ms`, the engine groups them
 * into sessions using two rules:
 *
 *   1. Inactivity gap > inactivityMs closes the previous session.
 *   2. Hard cap of maxSessionMs forces a close (so a tab left open
 *      while the user went on holiday does not yield a single
 *      multi-day session).
 *
 * The engine is pure (no I/O); it returns session start / heartbeat /
 * end events that the caller writes to ClickHouse and re-emits to NATS.
 *
 * Determinism: every rule branches only on `now_ms - last_event_at_ms`
 * and `now_ms - started_at_ms`, so feeding the same event sequence in
 * the same order yields identical session IDs. The session_id is the
 * SHA-256 of (workspace_id, viewer_id_key, started_at_ms) — locked
 * across replays.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { AnalyticsEvent } from '@domio/event-ingest';
import type { SessionCloseReason, SessionEvent, SessionRecord, SessionState } from '../types.js';

export interface RuleConfig {
  inactivityMs: number;
  maxSessionMs: number;
}

export interface IngestInput {
  workspace_id: string;
  viewer_id_key: string;
  event: AnalyticsEvent;
}

export interface RuleOutput {
  /** Sessions to close (already ended or evicted). */
  closed: SessionRecord[];
  /** Sessions to upsert. */
  upserted: SessionRecord[];
  /** Events to emit to NATS / ClickHouse. */
  emitted: SessionEvent[];
}

export function deriveSessionId(workspace_id: string, viewer_id_key: string, started_at_ms: number): string {
  const h = createHash('sha256');
  h.update(workspace_id);
  h.update('\0');
  h.update(viewer_id_key);
  h.update('\0');
  h.update(String(started_at_ms));
  return h.digest('hex');
}

export function buildSessionEngine(cfg: RuleConfig) {
  const open = new Map<string, SessionRecord>(); // by viewer_id_key

  function partitionKey(workspace_id: string, viewer_id_key: string): string {
    return `${workspace_id}|${viewer_id_key}`;
  }

  function close(session: SessionRecord, reason: SessionCloseReason): { closed: SessionRecord; emitted: SessionEvent } {
    const ended: SessionRecord = { ...session, state: 'closed' as SessionState, ended_at_ms: session.last_event_at_ms };
    return { closed: ended, emitted: { type: 'session.ended', session: ended, reason } };
  }

  return {
    /** Apply one event; returns the rule output. */
    apply(input: IngestInput): RuleOutput {
      const { workspace_id, viewer_id_key, event } = input;
      const now_ms = event.ts_ms;
      const existing = open.get(partitionKey(workspace_id, viewer_id_key));
      const upserted: SessionRecord[] = [];
      const emitted: SessionEvent[] = [];

      if (!existing) {
        const session: SessionRecord = {
          session_id: deriveSessionId(workspace_id, viewer_id_key, now_ms),
          workspace_id,
          viewer_id_key,
          deck_id: event.deck_id,
          state: 'open',
          started_at_ms: now_ms,
          last_event_at_ms: now_ms,
          ended_at_ms: null,
          event_count: 1,
          source_app: event.source_app,
          privacy_mode: event.privacy_mode,
          device_class: event.device_class,
          region_pinned: event.region_pinned ?? null,
          country_iso: event.country_iso ?? null,
        };
        open.set(partitionKey(workspace_id, viewer_id_key), session);
        upserted.push(session);
        emitted.push({ type: 'session.started', session });
        return { closed: [], upserted, emitted };
      }

      const gap = now_ms - existing.last_event_at_ms;
      const duration = now_ms - existing.started_at_ms;
      const tooLong = duration > cfg.maxSessionMs;

      // Inactivity rule: if the gap exceeds inactivityMs we close the
      // existing session and start a new one. Same applies if the
      // session is too long.
      if (gap >= cfg.inactivityMs || tooLong) {
        const { closed, emitted: endEv } = close(existing, tooLong ? 'max_duration' : 'inactivity');
        const closedOut: SessionRecord[] = [closed];
        const session: SessionRecord = {
          session_id: deriveSessionId(workspace_id, viewer_id_key, now_ms),
          workspace_id,
          viewer_id_key,
          deck_id: event.deck_id,
          state: 'open',
          started_at_ms: now_ms,
          last_event_at_ms: now_ms,
          ended_at_ms: null,
          event_count: 1,
          source_app: event.source_app,
          privacy_mode: event.privacy_mode,
          device_class: event.device_class,
          region_pinned: event.region_pinned ?? null,
          country_iso: event.country_iso ?? null,
        };
        open.set(partitionKey(workspace_id, viewer_id_key), session);
        upserted.push(session);
        emitted.push(endEv, { type: 'session.started', session });
        return { closed: closedOut, upserted, emitted };
      }

      // Heartbeat: extend the open session.
      const updated: SessionRecord = {
        ...existing,
        deck_id: event.deck_id,
        last_event_at_ms: now_ms,
        event_count: existing.event_count + 1,
        region_pinned: event.region_pinned ?? existing.region_pinned,
        country_iso: event.country_iso ?? existing.country_iso,
      };
      open.set(partitionKey(workspace_id, viewer_id_key), updated);
      upserted.push(updated);
      emitted.push({ type: 'session.heartbeat', session: updated });
      return { closed: [], upserted, emitted };
    },

    /** Force-evict all sessions older than `now_ms - inactivityMs`. Used by periodic flushes. */
    evictStale(now_ms: number): RuleOutput {
      const closed: SessionRecord[] = [];
      const emitted: SessionEvent[] = [];
      const remaining: SessionRecord[] = [];
      for (const s of open.values()) {
        if (now_ms - s.last_event_at_ms >= cfg.inactivityMs) {
          const out = close(s, 'evict');
          closed.push(out.closed);
          emitted.push(out.emitted);
        } else {
          remaining.push(s);
        }
      }
      open.clear();
      for (const r of remaining) open.set(partitionKey(r.workspace_id, r.viewer_id_key), r);
      return { closed, upserted: [], emitted };
    },

    /** All open sessions (for shutdown). */
    openSessions(): readonly SessionRecord[] {
      return Array.from(open.values());
    },

    /** Total number of open sessions. */
    size(): number {
      return open.size;
    },

    /** Emit a fresh unique session-id (used by replay seed). */
    newSessionId(): string {
      return randomUUID();
    },
  };
}

export type SessionEngine = ReturnType<typeof buildSessionEngine>;