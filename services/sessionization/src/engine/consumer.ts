/**
 * Sessionization — single-partition deterministic consumer (Phase 17 W4).
 *
 * The Kafka topic `events.ingest.raw` is partitioned by
 * `${workspace_id}:${viewer_id_key}` so every event for a single
 * viewer lands on a single partition. We process one partition at a
 * time, in offset order, using the rule engine.
 *
 * Two consumer instances must never process the same partition; the
 * rule engine assumes strict per-viewer ordering. The consumer is
 * deterministic: replaying the same Kafka offsets produces identical
 * session IDs, identical `started_at_ms`, identical `event_count`,
 * and identical close reasons.
 *
 * The consumer is a function (not a class) so the rule engine and the
 * store are pure dependencies — easy to swap and easy to test.
 */

import type { AnalyticsEvent } from '@domio/event-ingest';
import type { SessionCloseReason, SessionEvent, SessionRecord } from '../types.js';
import { buildSessionEngine, type RuleOutput, type SessionEngine } from './rule.js';

export interface PartitionConsumerDeps {
  engine: SessionEngine;
  /** Apply the rule output (write to store, ClickHouse, NATS, ...). */
  flush(out: RuleOutput): Promise<void>;
}

export interface PartitionConsumeResult {
  /** Total events processed. */
  processed: number;
  /** Sessions closed by inactivity. */
  closedByInactivity: number;
  /** Sessions closed by max duration. */
  closedByMaxDuration: number;
  /** Sessions started in this batch. */
  started: number;
}

export async function consumePartition(
  deps: PartitionConsumerDeps,
  events: readonly AnalyticsEvent[],
): Promise<PartitionConsumeResult> {
  // Sort defensively by ts_ms, then by event_id (stable tiebreaker).
  // Kafka delivers in offset order which is usually the same as ts_ms,
  // but late-arriving events from a flaky client clock can break that
  // invariant — sorting here is a cheap correctness fix.
  const sorted = [...events].sort((a, b) => {
    if (a.ts_ms !== b.ts_ms) return a.ts_ms - b.ts_ms;
    if (a.event_id < b.event_id) return -1;
    if (a.event_id > b.event_id) return 1;
    return 0;
  });

  let started = 0;
  let closedByInactivity = 0;
  let closedByMaxDuration = 0;

  for (const ev of sorted) {
    const out = deps.engine.apply({
      workspace_id: ev.workspace_id,
      viewer_id_key: ev.viewer_id_key,
      event: ev,
    });
    for (const e of out.emitted) {
      if (e.type === 'session.started') started += 1;
      else if (e.type === 'session.ended') {
        if (e.reason === 'inactivity') closedByInactivity += 1;
        else if (e.reason === 'max_duration') closedByMaxDuration += 1;
      }
    }
    await deps.flush(out);
  }

  return {
    processed: sorted.length,
    closedByInactivity,
    closedByMaxDuration,
    started,
  };
}

/** Convenience builder that wires engine + emitter + store + sink. */
export interface ConsumerDeps {
  engine?: SessionEngine;
  onUpsert(s: SessionRecord): Promise<void>;
  onClose(s: SessionRecord, reason: SessionCloseReason): Promise<void>;
  onEmit(ev: SessionEvent): Promise<void>;
}

export function buildPartitionConsumer(deps: ConsumerDeps) {
  const engine = deps.engine ?? buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
  return {
    engine,
    async run(events: readonly AnalyticsEvent[]): Promise<PartitionConsumeResult> {
      return consumePartition(
        { engine, flush: async (out) => {
            for (const u of out.upserted) await deps.onUpsert(u);
            for (const c of out.closed) {
              const ev = out.emitted.find((e): e is Extract<SessionEvent, { type: 'session.ended' }> => e.type === 'session.ended' && e.session.session_id === c.session_id);
              if (ev) await deps.onClose(c, ev.reason);
            }
            for (const e of out.emitted) await deps.onEmit(e);
        } },
        events,
      );
    },
  };
}