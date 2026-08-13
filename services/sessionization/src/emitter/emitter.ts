/**
 * Sessionization — NATS emitter (Phase 17 W4).
 *
 * Emits session.started / session.heartbeat / session.ended events to
 * the NATS subject
 *
 *   analytics.session.{lifecycle}.{workspaceID}
 *
 * so the live-analytics WebSocket subscriber (W10) and the warehouse
 * rollup orchestrator (W2) can react in real time.
 */

import type { SessionEvent, SessionRecord } from '../types.js';

export interface EmitterClient {
  publish(subject: string, payload: unknown): Promise<void>;
}

export interface SessionEmitter {
  emit(ev: SessionEvent): Promise<void>;
  emitMany(events: readonly SessionEvent[]): Promise<void>;
}

export function buildSessionEmitter(client: EmitterClient): SessionEmitter {
  return {
    async emit(ev) {
      const subject = subjectFor(ev.type, ev.session);
      await client.publish(subject, ev);
    },
    async emitMany(events) {
      for (const e of events) {
        const subject = subjectFor(e.type, e.session);
        await client.publish(subject, e);
      }
    },
  };
}

export function subjectFor(eventType: SessionEvent['type'], session: SessionRecord): string {
  const lifecycle = eventType.split('.')[1]!; // 'started' | 'heartbeat' | 'ended'
  return `analytics.session.${lifecycle}.${session.workspace_id}`;
}

/** In-memory emitter for tests and dev fallback. */
export class InMemoryEmitterClient implements EmitterClient {
  public published: { subject: string; payload: unknown }[] = [];
  async publish(subject: string, payload: unknown): Promise<void> {
    this.published.push({ subject, payload });
  }
}
