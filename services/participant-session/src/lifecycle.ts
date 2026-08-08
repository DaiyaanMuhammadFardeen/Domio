/**
 * @domio/participant-session — lifecycle broadcaster.
 *
 * Phase 16 W2. Periodically scans participant rows and publishes
 * `session_started`, `session.idle_warning`, and `session.ended` to
 * the audience bus. The broadcaster is a thin orchestrator over
 * `ParticipantSessionService` + an `EdgeBus`.
 *
 * State machine (per workspace_id, session_id):
 *
 *   started → (soft_ttl) → idle_warning → (hard_ttl) → ended
 *                       ↘ reap (admin action)
 *
 * Soft TTL defaults to 90s; hard TTL to 30 minutes. Both are
 * configurable per session.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';

export type LifecyclePhase = 'started' | 'idle_warning' | 'ended' | 'reaped';

export interface LifecycleEvent {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly phase: LifecyclePhase;
  readonly ts_ms: number;
  readonly active_count: number;
  readonly idle_count: number;
}

export interface ActiveSessionSnapshot {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly active_count: number;
  readonly idle_count: number;
  readonly last_seen_at_ms: number;
}

export interface BroadcasterOptions {
  readonly bus: EdgeBus;
  readonly activeSessions: () => ReadonlyArray<ActiveSessionSnapshot>;
  readonly softTtlMs?: number;
  readonly hardTtlMs?: number;
  readonly tickMs?: number;
  readonly now?: () => number;
}

export class LifecycleBroadcaster {
  private readonly softTtlMs: number;
  private readonly hardTtlMs: number;
  private readonly tickMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedSessions = new Set<string>();
  private warnedSessions = new Set<string>();

  constructor(private readonly opts: BroadcasterOptions) {
    this.softTtlMs = opts.softTtlMs ?? 90_000;
    this.hardTtlMs = opts.hardTtlMs ?? 30 * 60 * 1000;
    this.tickMs = opts.tickMs ?? 15_000;
    this.now = opts.now ?? (() => Date.now());
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.tick().catch(() => {
        // Swallow — the broadcaster never dies.
      });
    }, this.tickMs);
    if (typeof this.timer === 'object' && this.timer !== null && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Force one sweep. Tests use this directly. */
  async tick(): Promise<void> {
    const nowMs = this.now();
    const sessions = this.opts.activeSessions();
    for (const s of sessions) {
      await this.processSession(s.workspace_id, s.session_id, s.active_count, s.idle_count, nowMs, s.last_seen_at_ms);
    }
  }

  private async processSession(
    workspace_id: string,
    session_id: string,
    active_count: number,
    idle_count: number,
    nowMs: number,
    last_seen_at_ms: number,
  ): Promise<void> {
    const key = `${workspace_id}::${session_id}`;
    if (!this.startedSessions.has(key)) {
      this.startedSessions.add(key);
      await this.emit({ workspace_id, session_id, phase: 'started', ts_ms: nowMs, active_count, idle_count });
    }
    if (nowMs - last_seen_at_ms > this.softTtlMs && !this.warnedSessions.has(key)) {
      this.warnedSessions.add(key);
      await this.emit({ workspace_id, session_id, phase: 'idle_warning', ts_ms: nowMs, active_count, idle_count });
    }
    if (nowMs - last_seen_at_ms > this.hardTtlMs) {
      await this.emit({ workspace_id, session_id, phase: 'ended', ts_ms: nowMs, active_count, idle_count });
      this.startedSessions.delete(key);
      this.warnedSessions.delete(key);
    }
  }

  async emit(event: LifecycleEvent): Promise<void> {
    await this.opts.bus.publish({
      session_id: event.session_id,
      topic: 'lifecycle',
      payload: encode(event),
    });
  }
}