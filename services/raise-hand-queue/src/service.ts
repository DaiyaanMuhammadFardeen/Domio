/**
 * @domio/raise-hand-queue — orchestration service.
 *
 * Phase 16 W8. Receives raise-hand events, enqueues, and supports
 * call/dismiss from the presenter. Publishes to
 * `realtime.session.{id}.raise_hand`.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { RaiseHand } from './types.js';
import { RaiseHandQueue } from './queue.js';

export interface RaiseHandServiceOptions {
  readonly bus: EdgeBus;
  readonly queue?: RaiseHandQueue;
  readonly now_ms?: () => number;
  readonly id_factory?: () => string;
}

export interface RaiseInput {
  workspace_id: string;
  session_id: string;
  participant_id: string;
}

export class RaiseHandService {
  private readonly bus: EdgeBus;
  private readonly queue: RaiseHandQueue;
  private readonly now_ms: () => number;
  private readonly id_factory: () => string;

  constructor(opts: RaiseHandServiceOptions) {
    this.bus = opts.bus;
    this.queue = opts.queue ?? new RaiseHandQueue();
    this.now_ms = opts.now_ms ?? (() => Date.now());
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
  }

  async raise(input: RaiseInput): Promise<RaiseHand> {
    const ts = this.now_ms();
    const hand: RaiseHand = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      status: 'queued',
      position: this.queue.size(ts),
      raised_at_ms: ts,
      resolved_at_ms: null,
      version: 1,
    };
    this.queue.enqueue(hand);
    const updated = this.queue.head(ts);
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'raise_hand',
      payload: encode({
        kind: 'raise_hand',
        participant_id: input.participant_id,
        position: updated?.position ?? 0,
      }),
    });
    return updated ?? hand;
  }

  async call(
    session_id: string,
    participant_id: string,
    actor_id: string,
  ): Promise<RaiseHand | null> {
    const ts = this.now_ms();
    const called = this.queue.call(participant_id, ts);
    if (called) {
      await this.bus.publish({
        session_id,
        topic: 'raise_hand',
        payload: encode({ kind: 'called', participant_id, called_by: actor_id }),
      });
    }
    return called;
  }

  async dismiss(
    session_id: string,
    participant_id: string,
    actor_id: string,
  ): Promise<RaiseHand | null> {
    const ts = this.now_ms();
    const dismissed = this.queue.dismiss(participant_id, ts);
    if (dismissed) {
      await this.bus.publish({
        session_id,
        topic: 'raise_hand',
        payload: encode({ kind: 'dismissed', participant_id, dismissed_by: actor_id }),
      });
    }
    return dismissed;
  }

  list(): ReadonlyArray<RaiseHand> {
    return this.queue.list(this.now_ms());
  }

  size(): number {
    return this.queue.size(this.now_ms());
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
