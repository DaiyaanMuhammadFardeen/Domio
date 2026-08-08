/**
 * @domio/edge-pubsub — bus interface.
 *
 * Phase 16 W1. The bus is a thin pub/sub abstraction. Two
 * implementations live in this package:
 *
 *   - `InMemoryEdgeBus` — for dev + tests; pure in-process.
 *   - `NatsEdgeBus`     — production; wraps nats.js (NATS server).
 *
 * The bus intentionally does NOT persist. For replay/recap, callers
 * subscribe-and-record in the recap worker (P15 W15).
 *
 * The subscription model is a two-step dance:
 *   1. `subscribe({ topic, consumer, start_seq? })` — returns a handle
 *      whose `handler` field is initially a no-op.
 *   2. The caller assigns `handle.handler = async (msg) => {...}` and
 *      messages flow.
 * This pattern lets us avoid races between subscription confirmation
 * and the first published message.
 */

import type { AudienceTopic } from './topics.js';
import { topicFor } from './topics.js';

export interface EdgeMessage {
  readonly topic: string;
  readonly payload: Uint8Array;
  readonly ts_ms: number;
  /** Sequence number assigned by the bus; monotonic per shard. */
  readonly seq: number;
}

export type EdgeHandler = (msg: EdgeMessage) => Promise<void>;

export interface EdgeSubscribeOptions {
  readonly topic: string;
  readonly consumer: string;
  /** Start sequence (inclusive). `0` = head. */
  readonly start_seq?: number;
}

export interface EdgeSubscribeHandle {
  handler: EdgeHandler;
  unsubscribe(): Promise<void>;
}

export interface EdgeBus {
  publish(input: {
    session_id: string;
    topic: AudienceTopic;
    shard_index?: number;
    payload: Uint8Array;
  }): Promise<{ topic: string; seq: number; ts_ms: number }>;
  subscribe(opts: EdgeSubscribeOptions): Promise<EdgeSubscribeHandle>;
  close(): Promise<void>;
}

export function encode(input: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(input));
}

export function decode<T = unknown>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export { topicFor };