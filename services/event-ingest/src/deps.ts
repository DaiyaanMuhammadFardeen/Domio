/**
 * Event-ingest — service dependencies (Phase 17 W1).
 *
 * The IngestDeps container is what main() builds and passes into
 * buildApp(). Tests construct their own with InMemory* replacements
 * (no Kafka, no Redis, no NATS).
 */

import type { IngestConfig } from './types.js';
import type { EventValidator } from './validation.js';
import type { PiiStripper } from './pii.js';
import type { HmacVerifier } from './hmac.js';
import type { NonceCache } from './nonce.js';
import type { KafkaPublisher } from './kafka.js';
import type { Spool } from './spool.js';
import type { NatsBridge } from './nats_bridge.js';
import type { Metrics } from './metrics/metrics.js';
import type { DlqWriter } from './dlq.js';

export interface IngestDeps {
  cfg: IngestConfig;
  validator: EventValidator;
  pii: PiiStripper;
  hmac: HmacVerifier;
  nonces: NonceCache;
  publisher: KafkaPublisher;
  /**
   * Optional Kafka publisher for the DLQ topic. When set, DLQ writes are
   * also published to `events.ingest.dlq` so downstream consumers
   * (replay tool, alerts) see them in real time. When null (tests), DLQ
   * is disk-only.
   */
  dlqPublisher: KafkaPublisher | null;
  spool: Spool;
  nats: NatsBridge;
  dlq: DlqWriter;
  metrics: Metrics;
  /** Monotonic sequence assigned to accepted events. */
  nextSeq: () => number;
}
