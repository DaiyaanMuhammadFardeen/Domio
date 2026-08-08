/**
 * @domio/reaction-broadcaster — orchestration service.
 *
 * Phase 16 W8. Receives reactions, dedups by idempotency key within a
 * short ring, and publishes to `realtime.session.{id}.reaction`.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { ReactionEvent } from './types.js';
import { ReactionRing } from './ring.js';

export interface ReactionBroadcasterOptions {
  readonly bus: EdgeBus;
  readonly ring?: ReactionRing;
  readonly now_ms?: () => number;
}

export interface BroadcastInput {
  workspace_id: string;
  session_id: string;
  slide_id: string;
  participant_id: string;
  emoji: string;
  idempotency_key: string;
}

export class ReactionBroadcaster {
  private readonly bus: EdgeBus;
  private readonly ring: ReactionRing;
  private readonly now_ms: () => number;

  constructor(opts: ReactionBroadcasterOptions) {
    this.bus = opts.bus;
    this.ring = opts.ring ?? new ReactionRing();
    this.now_ms = opts.now_ms ?? (() => Date.now());
  }

  async broadcast(input: BroadcastInput): Promise<ReactionEvent> {
    const event: ReactionEvent = {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      slide_id: input.slide_id,
      participant_id: input.participant_id,
      emoji: input.emoji,
      posted_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    const isNew = this.ring.reserve(input.idempotency_key);
    if (!isNew) {
      const prior = this.ring.get(input.idempotency_key) as ReactionEvent | null;
      return prior ?? event;
    }
    this.ring.commit(input.idempotency_key, event);
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'reaction',
      payload: encode({ kind: 'reaction', ...event }),
    });
    return event;
  }

  /** Recent count (for tests). */
  recentCount(): number {
    return this.ring.size();
  }
}
