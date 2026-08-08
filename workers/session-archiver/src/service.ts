/**
 * @domio/session-archiver — orchestration service.
 *
 * Phase 16 W2. Subscribes to lifecycle events, accumulates per-session
 * counts, and persists a SessionArchive on `ended`.
 */

import type { EdgeBus, EdgeSubscribeHandle } from '@domio/edge-pubsub';
import { decode, topicFor } from '@domio/edge-pubsub';
import type { LifecycleEvent } from '@domio/participant-session';
import {
  type SessionArchive,
  type EngagementCounts,
  emptyEngagement,
} from './types.js';
import { isArchiveStore, type ArchiveStore } from './store.js';

export interface ArchiverOptions {
  readonly bus: EdgeBus;
  readonly store: ArchiveStore;
}

interface SessionAccumulator {
  workspace_id: string;
  session_id: string;
  started_at_ms: number;
  peak_active: number;
  total_participants: number;
  engagement: EngagementCounts;
  raw: LifecycleEvent[];
}

export class SessionArchiver {
  private readonly bus: EdgeBus;
  private readonly store: ArchiveStore;
  private readonly accumulators = new Map<string, SessionAccumulator>();
  private readonly handles = new Map<string, EdgeSubscribeHandle>();

  constructor(opts: ArchiverOptions) {
    if (!isArchiveStore(opts.store)) {
      throw new Error('SessionArchiver: store is required');
    }
    this.bus = opts.bus;
    this.store = opts.store;
  }

  /**
   * Register a session for archival. Subscribes to the per-session
   * lifecycle topic. Idempotent — registering twice for the same
   * session_id is a no-op.
   */
  async registerSession(session_id: string): Promise<void> {
    if (this.handles.has(session_id)) return;
    const topic = topicFor({ session_id, topic: 'lifecycle' });
    const handle = await this.bus.subscribe({
      topic,
      consumer: `session-archiver:${session_id}`,
      start_seq: 0,
    });
    handle.handler = async (msg) => {
      const decoded = decode<LifecycleEvent>(msg.payload);
      await this.handle(session_id, decoded);
    };
    this.handles.set(session_id, handle);
  }

  async unregisterSession(session_id: string): Promise<void> {
    const handle = this.handles.get(session_id);
    if (!handle) return;
    await handle.unsubscribe();
    this.handles.delete(session_id);
  }

  async start(): Promise<void> {
    // No-op: sessions are registered via registerSession(). Provided
    // for symmetry with future bulk-discovery.
  }

  async stop(): Promise<void> {
    for (const [sid] of this.handles) {
      await this.unregisterSession(sid);
    }
  }

  async handle(session_id: string, event: LifecycleEvent): Promise<void> {
    const key = `${event.workspace_id}::${session_id}`;
    let acc = this.accumulators.get(key);
    if (event.phase === 'started') {
      acc = {
        workspace_id: event.workspace_id,
        session_id,
        started_at_ms: event.ts_ms,
        peak_active: event.active_count,
        total_participants: 0,
        engagement: emptyEngagement(),
        raw: [],
      };
      this.accumulators.set(key, acc);
    } else if (!acc) {
      // Pre-existing session from before this archiver booted; create
      // a synthetic accumulator.
      acc = {
        workspace_id: event.workspace_id,
        session_id,
        started_at_ms: event.ts_ms,
        peak_active: 0,
        total_participants: 0,
        engagement: emptyEngagement(),
        raw: [],
      };
      this.accumulators.set(key, acc);
    }
    acc.peak_active = Math.max(acc.peak_active, event.active_count);
    acc.raw.push(event);
    if (event.phase === 'ended') {
      const archive: SessionArchive = {
        workspace_id: event.workspace_id,
        session_id,
        ended_at_ms: event.ts_ms,
        peak_active: acc.peak_active,
        total_participants: acc.total_participants,
        engagement: acc.engagement,
        raw: acc.raw,
      };
      await this.store.put(archive);
      this.accumulators.delete(key);
    }
  }

  /** For tests — increment an engagement counter. */
  incrementEngagement(input: { workspace_id: string; session_id: string; kind: keyof EngagementCounts; by?: number }): void {
    const key = `${input.workspace_id}::${input.session_id}`;
    let acc = this.accumulators.get(key);
    if (!acc) {
      acc = {
        workspace_id: input.workspace_id,
        session_id: input.session_id,
        started_at_ms: 0,
        peak_active: 0,
        total_participants: 0,
        engagement: emptyEngagement(),
        raw: [],
      };
      this.accumulators.set(key, acc);
    }
    acc.engagement = { ...acc.engagement, [input.kind]: acc.engagement[input.kind] + (input.by ?? 1) };
  }

  /** Inspect accumulator count (for tests/diagnostics). */
  size(): number {
    return this.accumulators.size;
  }
}
