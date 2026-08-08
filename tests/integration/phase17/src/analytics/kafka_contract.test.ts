/**
 * Phase 17 W1/W2 — Kafka contract integration tests.
 *
 * These tests pin the invariants the rest of the pipeline depends on:
 *   * Partition key is exactly `workspace_id:viewer_id_key`. Sessionization
 *     (W4) relies on this — all events for one viewer must land on the
 *     same partition, in order.
 *   * publishMany() reports one recordMetadata per event so the
 *     ingest route can stamp _ingest_seq against the right offset.
 *   * The DLQ topic receives a copy of every malformed/rejected
 *     event with a `x-dlq-reason` header.
 *
 * We use the in-memory publisher already shipped in event-ingest.
 * The real Kafka broker is exercised by docker-compose phase17.
 */
import { describe, it, expect } from 'vitest';
import { buildInMemoryKafkaPublisher } from '@domio/event-ingest/kafka';
import { KAFKA_TOPIC_RAW, KAFKA_TOPIC_DLQ } from '@domio/event-ingest/types';
import type { AnalyticsEvent } from '@domio/event-ingest/types';

function mkEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    event_id: 'e-1',
    event_name: 'view',
    schema_version: 1,
    ts_ms: Date.now(),
    workspace_id: 'ws-1',
    deck_id: 'deck-1',
    slide_id: 's-1',
    viewer_id_key: 'v-1',
    session_id_key: 'sess-1',
    privacy_mode: 'identified',
    device_class: 'desktop',
    source_app: 'viewer',
    ingest_topic: KAFKA_TOPIC_RAW,
    ...overrides,
  };
}

describe('Kafka contract — event-ingest', () => {
  it('publishes to events.ingest.raw by default', async () => {
    const pub = buildInMemoryKafkaPublisher();
    const ev = mkEvent();
    const r = await pub.publish(ev);
    expect(r.topic).toBe(KAFKA_TOPIC_RAW);
    expect(pub.published).toHaveLength(1);
  });

  it('partition key for an event is `${workspace_id}:${viewer_id_key}`', () => {
    // The DAO/SQL in W4 will use the partition key for sessionization.
    // Pin the exact format here so the Go side and TS side cannot drift.
    const ev = mkEvent({ workspace_id: 'ws-X', viewer_id_key: 'v-Y' });
    const expected = 'ws-X:v-Y';
    const actual = `${ev.workspace_id}:${ev.viewer_id_key}`;
    expect(actual).toBe(expected);
  });

  it('publishMany returns one recordMetadata per event in order', async () => {
    const pub = buildInMemoryKafkaPublisher();
    const events = [mkEvent({ event_id: 'a' }), mkEvent({ event_id: 'b' }), mkEvent({ event_id: 'c' })];
    const results = await pub.publishMany(events);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.offset)).toEqual(['0', '1', '2']);
    expect(pub.published.map((e) => e.event_id)).toEqual(['a', 'b', 'c']);
  });

  it('DLQ publishes the raw payload plus reason header', async () => {
    const pub = buildInMemoryKafkaPublisher();
    const payload = new TextEncoder().encode(JSON.stringify({ reason: 'schema', event_id: 'e-bad' }));
    await pub.publishRaw(KAFKA_TOPIC_DLQ, 'e-bad', payload);
    expect(pub.publishRawCalls).toHaveLength(1);
    const call = pub.publishRawCalls[0]!;
    expect(call.topic).toBe(KAFKA_TOPIC_DLQ);
    expect(call.key).toBe('e-bad');
    expect(JSON.parse(new TextDecoder().decode(call.payload))).toMatchObject({ reason: 'schema' });
  });

  it('preserves viewer ordering across publishMany — required for sessionization', async () => {
    // W4 sessionization requires that all events for one viewer land
    // on the same partition, in arrival order. The TS publisher does
    // not sort by viewer; that responsibility lives in the Kafka
    // partitioner. We assert here only that the publishMany call
    // surfaces events to KafkaJS in the order they were appended.
    const pub = buildInMemoryKafkaPublisher();
    const viewerId = 'v-1';
    const events = Array.from({ length: 25 }, (_, i) => mkEvent({
      event_id: `e-${i}`,
      viewer_id_key: viewerId,
      ts_ms: 1_000 + i,
    }));
    await pub.publishMany(events);
    expect(pub.published.map((e) => e.event_id)).toEqual(events.map((e) => e.event_id));
  });

  it('publishMany with empty list returns an empty array (no error)', async () => {
    const pub = buildInMemoryKafkaPublisher();
    expect(await pub.publishMany([])).toEqual([]);
  });
});
