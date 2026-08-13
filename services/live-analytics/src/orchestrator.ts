/**
 * Live-analytics — orchestrator (Phase 17 W10).
 *
 * Single object that the routes/WS layer talks to. Holds the ring
 * buffer, fan-out hub, summary sink, and clickhouse client. The
 * NATS subscriber calls ingest() which buffers the event, recomputes
 * the pulse, and notifies all WebSocket subscribers.
 */

import type { ClickHouseClient } from './store/clickhouse.js';
import type { RingBuffer } from './store/ring_buffer.js';
import { buildRingBuffer } from './store/ring_buffer.js';
import { derivePulse } from './pulse/derive.js';
import { buildSummarySink } from './summary/sink.js';
import type { Hub } from './ws/hub.js';
import { buildHub } from './ws/hub.js';
import type { LiveEvent, LivePulse, LiveSessionSummary } from './types.js';

export interface Orchestrator {
  ingest(event: LiveEvent): Promise<void>;
  /** Current pulse snapshot for a session. */
  pulse(workspace_id: string, session_id: string): LivePulse;
  /** Replay the trailing window to a newly-attached subscriber. */
  replay(workspace_id: string, session_id: string): LiveEvent[];
  /** Flush one session into a summary row. */
  flush(
    workspace_id: string,
    session_id: string,
    deck_id: string,
  ): Promise<LiveSessionSummary | null>;
  /** Number of sessions currently buffered. */
  sessionCount(): number;
  hub(): Hub;
}

export interface OrchestratorDeps {
  ch: ClickHouseClient;
  buffer?: RingBuffer;
  ringBufferSize?: number;
}

export function buildOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const buffer = deps.buffer ?? buildRingBuffer(deps.ringBufferSize ?? 500);
  const sink = buildSummarySink(deps.ch, buffer);
  const hub = buildHub();

  async function ingest(event: LiveEvent): Promise<void> {
    buffer.push(event);
    const pulse = derivePulse(
      event.workspace_id,
      event.session_id,
      buffer.snapshot(event.workspace_id, event.session_id),
    );
    hub.broadcast(event.workspace_id, event.session_id, pulse);
  }

  return {
    async ingest(event) {
      await ingest(event);
    },
    pulse(workspace_id, session_id) {
      return derivePulse(workspace_id, session_id, buffer.snapshot(workspace_id, session_id));
    },
    replay(workspace_id, session_id) {
      return buffer.snapshot(workspace_id, session_id);
    },
    async flush(workspace_id, session_id, deck_id) {
      const row = await sink.flushOne(workspace_id, session_id, deck_id);
      if (row) hub.close(workspace_id, session_id);
      return row;
    },
    sessionCount() {
      return buffer.sessionCount();
    },
    hub() {
      return hub;
    },
  };
}
