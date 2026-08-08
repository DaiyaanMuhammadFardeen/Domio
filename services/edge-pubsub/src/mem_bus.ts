/**
 * @domio/edge-pubsub — in-memory bus.
 *
 * Phase 16 W1. Backs the audience fan-out during dev and tests. The
 * implementation is intentionally simple: a per-topic array of
 * subscribers + a per-topic monotonic sequence. Messages are
 * delivered synchronously to subscribers in subscription order.
 *
 * Tests cover the canonical pattern: subscribe → set handler →
 * publish → receive, unsubscribe stops, multi-subscriber fan-out,
 * sequence monotonicity.
 */

import type {
  EdgeBus,
  EdgeMessage,
  EdgeSubscribeHandle,
  EdgeSubscribeOptions,
} from './bus.js';
import { topicFor } from './topics.js';

interface Subscriber {
  consumer: string;
  handle: EdgeSubscribeHandle;
  start_seq: number;
}

export class InMemoryEdgeBus implements EdgeBus {
  private readonly subscriptions = new Map<string, Subscriber[]>();
  private readonly seqs = new Map<string, number>();
  private closed = false;

  async publish(input: {
    session_id: string;
    topic: Parameters<typeof topicFor>[0]['topic'];
    shard_index?: number;
    payload: Uint8Array;
  }): Promise<{ topic: string; seq: number; ts_ms: number }> {
    if (this.closed) throw new Error('bus closed');
    const topic = topicFor({
      session_id: input.session_id,
      topic: input.topic,
      ...(typeof input.shard_index === 'number' ? { shard_index: input.shard_index } : {}),
    });
    const seq = (this.seqs.get(topic) ?? 0) + 1;
    this.seqs.set(topic, seq);
    const ts_ms = Date.now();
    const msg: EdgeMessage = { topic, payload: input.payload, ts_ms, seq };

    const subs = this.subscriptions.get(topic) ?? [];
    // Snapshot so unsubscribe from a handler doesn't corrupt the iteration.
    for (const sub of [...subs]) {
      if (seq < sub.start_seq) continue;
      await sub.handle.handler(msg);
    }
    return { topic, seq, ts_ms };
  }

  async subscribe(opts: EdgeSubscribeOptions): Promise<EdgeSubscribeHandle> {
    if (this.closed) throw new Error('bus closed');
    const handle: EdgeSubscribeHandle = {
      handler: async () => undefined,
      unsubscribe: async () => {
        const list = this.subscriptions.get(opts.topic) ?? [];
        this.subscriptions.set(
          opts.topic,
          list.filter((s) => s.consumer !== opts.consumer),
        );
      },
    };
    const sub: Subscriber = {
      consumer: opts.consumer,
      handle,
      start_seq: opts.start_seq ?? 0,
    };
    const subs = this.subscriptions.get(opts.topic) ?? [];
    subs.push(sub);
    this.subscriptions.set(opts.topic, subs);
    return handle;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subscriptions.clear();
    this.seqs.clear();
  }
}