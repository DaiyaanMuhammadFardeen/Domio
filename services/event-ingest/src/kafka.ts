/**
 * Event-ingest — Kafka publisher (Phase 17 W1).
 *
 * Wraps KafkaJS so the rest of the service is broker-agnostic. The
 * publisher is constructed in a disconnected state and connects
 * lazily. Every send returns the assigned offset; failed sends throw
 * so the route layer can fall back to the disk spool.
 *
 * The partition key is `${workspace_id}:${viewer_id_key}` so that all
 * events for one viewer land on the same partition — this is the
 * ordering invariant sessionization (W4) depends on.
 */

import type { AnalyticsEvent } from './types.js';
import { KAFKA_TOPIC_RAW } from './types.js';
import { IngestUnavailableError } from './errors.js';

export interface KafkaPublisher {
  publish(event: AnalyticsEvent): Promise<{ topic: string; partition: number; offset: string }>;
  publishMany(events: AnalyticsEvent[]): Promise<Array<{ topic: string; partition: number; offset: string }>>;
  /** Send raw bytes (used by the disk-spool replay path). */
  publishRaw(topic: string, partitionKey: string, payload: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  /** True when the producer is connected and ready. */
  ready(): boolean;
}

function partitionKeyFor(event: AnalyticsEvent): string {
  return `${event.workspace_id}:${event.viewer_id_key}`;
}

interface KafkaJsModule {
  Kafka: typeof import('kafkajs').Kafka;
  CompressionTypes: typeof import('kafkajs').CompressionTypes;
}

let cachedKafkaJs: KafkaJsModule | null = null;
async function loadKafkaJs(): Promise<KafkaJsModule> {
  if (cachedKafkaJs) return cachedKafkaJs;
  const mod = await import('kafkajs');
  cachedKafkaJs = { Kafka: mod.Kafka, CompressionTypes: mod.CompressionTypes };
  return cachedKafkaJs;
}

export async function buildKafkaPublisher(
  brokers: string[],
  clientId = 'domio-event-ingest',
): Promise<KafkaPublisher> {
  if (brokers.length === 0) {
    throw new IngestUnavailableError('kafkaBrokers must contain at least one host:port');
  }
  const { Kafka } = await loadKafkaJs();
  const kafka = new Kafka({
    clientId,
    brokers,
    retry: { retries: 5, initialRetryTime: 100, maxRetryTime: 5000 },
  });
  const producer = kafka.producer({
    idempotent: true,
    maxInFlightRequests: 5,
    transactionTimeout: 30_000,
    allowAutoTopicCreation: false,
  });
  await producer.connect();

  const publishMany = async (events: AnalyticsEvent[]) => {
    if (events.length === 0) return [];
    const { CompressionTypes } = await loadKafkaJs();
    try {
      const topicMessages = new Map<string, Array<{ key: string; value: Buffer }>>();
      for (const ev of events) {
        const list = topicMessages.get(KAFKA_TOPIC_RAW) ?? [];
        list.push({ key: partitionKeyFor(ev), value: Buffer.from(JSON.stringify(ev), 'utf-8') });
        topicMessages.set(KAFKA_TOPIC_RAW, list);
      }
      const batches: Array<{ topic: string; messages: Array<{ key: string; value: Buffer }> }> = [];
      for (const [topic, messages] of topicMessages.entries()) {
        batches.push({ topic, messages });
      }
      const result = await producer.sendBatch({
        topicMessages: batches,
        compression: CompressionTypes.LZ4,
        acks: -1,
      });
      // KafkaJS returns { topicName: RecordMetadata[] }; newer versions
      // return an array. We normalize both shapes.
      const out: Array<{ topic: string; partition: number; offset: string }> = [];
      if (Array.isArray(result)) {
        for (const r of result) {
          const rec = r as unknown as {
            topicName?: string;
            topic?: string;
            recordMetadata?: Array<{ partition: number; offset: string }>;
          };
          const topic = rec.topicName ?? rec.topic ?? KAFKA_TOPIC_RAW;
          for (const m of rec.recordMetadata ?? []) {
            out.push({ topic, partition: m.partition, offset: m.offset });
          }
        }
      } else if (result && typeof result === 'object') {
        for (const [topic, recs] of Object.entries(result as Record<string, unknown>)) {
          const list = (recs as Array<{ partition: number; offset: string }> | undefined) ?? [];
          for (const m of list) {
            out.push({ topic, partition: m.partition, offset: m.offset });
          }
        }
      }
      return out;
    } catch (err) {
      throw new IngestUnavailableError(
        `kafka publish failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return {
    ready() {
      return true;
    },
    async publish(event) {
      const results = await publishMany([event]);
      const first = results[0];
      if (!first) throw new IngestUnavailableError('kafka publish returned no offset');
      return first;
    },
    async publishMany(events) {
      return publishMany(events);
    },
    async publishRaw(topic, partitionKey, payload) {
      try {
        await producer.send({
          topic,
          messages: [{ key: partitionKey, value: Buffer.from(payload) }],
          acks: -1,
        });
      } catch (err) {
        throw new IngestUnavailableError(
          `kafka publishRaw failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    async disconnect() {
      try {
        await producer.disconnect();
      } catch {
        // ignore — disconnect is best-effort
      }
    },
  };
}

/**
 * In-memory publisher for tests. Tracks the most recent batch so unit
 * tests can assert what would have been written to Kafka.
 */
export interface InMemoryKafkaPublisher extends KafkaPublisher {
  published: AnalyticsEvent[];
  publishRawCalls: Array<{ topic: string; key: string; payload: Uint8Array }>;
}

export function buildInMemoryKafkaPublisher(): InMemoryKafkaPublisher {
  const state: InMemoryKafkaPublisher = {
    published: [],
    publishRawCalls: [],
    ready() {
      return true;
    },
    async publish(event) {
      this.published.push(event);
      return { topic: KAFKA_TOPIC_RAW, partition: 0, offset: String(this.published.length - 1) };
    },
    async publishMany(events) {
      const start = state.published.length;
      state.published.push(...events);
      return events.map((_, i) => ({
        topic: KAFKA_TOPIC_RAW,
        partition: 0,
        offset: String(start + i),
      }));
    },
    async publishRaw(topic, key, payload) {
      state.publishRawCalls.push({ topic, key, payload });
    },
    async disconnect() {
      /* no-op */
    },
  };
  return state;
}

/**
 * Always-failing publisher used to simulate Kafka downtime. Tests can
 * assert that the spool absorbs the events.
 */
export function buildFailingKafkaPublisher(): KafkaPublisher {
  return {
    ready() {
      return false;
    },
    async publish() {
      throw new IngestUnavailableError('simulated kafka outage');
    },
    async publishMany() {
      throw new IngestUnavailableError('simulated kafka outage');
    },
    async publishRaw() {
      throw new IngestUnavailableError('simulated kafka outage');
    },
    async disconnect() {
      /* no-op */
    },
  };
}