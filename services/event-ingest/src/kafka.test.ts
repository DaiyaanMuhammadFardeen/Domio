/**
 * Tests for the in-memory Kafka publisher (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildInMemoryKafkaPublisher } from './kafka.js';
import type { AnalyticsEvent } from './types.js';

function event(workspace: string, viewer: string): AnalyticsEvent {
  return {
    event_id: `e-${workspace}-${viewer}`,
    event_name: 'view',
    schema_version: 1,
    ts_ms: Date.now(),
    workspace_id: workspace,
    deck_id: 'd-1',
    viewer_id_key: viewer,
    privacy_mode: 'identified',
    device_class: 'desktop',
    source_app: 'viewer',
    ingest_topic: 'events.ingest.raw',
  };
}

describe('in-memory Kafka publisher', () => {
  it('records published events', async () => {
    const pub = buildInMemoryKafkaPublisher();
    await pub.publish(event('ws-a', 'v-1'));
    expect(pub.published.length).toBe(1);
  });

  it('publishes a batch in order', async () => {
    const pub = buildInMemoryKafkaPublisher();
    const events = [event('ws-a', 'v-1'), event('ws-a', 'v-2'), event('ws-b', 'v-3')];
    const offsets = await pub.publishMany(events);
    expect(offsets).toHaveLength(3);
    expect(pub.published[0]?.viewer_id_key).toBe('v-1');
    expect(pub.published[1]?.viewer_id_key).toBe('v-2');
    expect(pub.published[2]?.viewer_id_key).toBe('v-3');
  });

  it('publishes an empty batch without error', async () => {
    const pub = buildInMemoryKafkaPublisher();
    expect(await pub.publishMany([])).toHaveLength(0);
  });
});