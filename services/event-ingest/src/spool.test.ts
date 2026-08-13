/**
 * Tests for the in-memory spool (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildInMemorySpool, buildFlusher } from './spool.js';
import { buildInMemoryKafkaPublisher } from './kafka.js';
import type { AnalyticsEvent } from './types.js';

function event(workspace: string, viewer: string, kind: string): AnalyticsEvent {
  return {
    event_id: `e-${workspace}-${viewer}-${kind}`,
    event_name: 'view',
    schema_version: 1,
    ts_ms: Date.now(),
    workspace_id: workspace,
    deck_id: 'deck-1',
    viewer_id_key: viewer,
    privacy_mode: 'identified',
    device_class: 'desktop',
    source_app: 'viewer',
    ingest_topic: 'events.ingest.raw',
  };
}

describe('in-memory spool', () => {
  it('groups events by partition key', async () => {
    const spool = buildInMemorySpool();
    await spool.write(event('ws-a', 'v-1', 'view'));
    await spool.write(event('ws-a', 'v-1', 'view'));
    await spool.write(event('ws-b', 'v-2', 'view'));
    const files = await spool.list();
    expect(files).toHaveLength(2);
    const drainedA = await spool.drain(files[0]!);
    expect(drainedA.length).toBeGreaterThan(0);
  });

  it('remove deletes the file', async () => {
    const spool = buildInMemorySpool();
    await spool.write(event('ws-a', 'v-1', 'view'));
    const files = await spool.list();
    await spool.remove(files[0]!);
    expect(await spool.list()).toHaveLength(0);
  });

  it('size accumulates across files', async () => {
    const spool = buildInMemorySpool();
    await spool.write(event('ws-a', 'v-1', 'view'));
    await spool.write(event('ws-b', 'v-2', 'view'));
    expect(await spool.size()).toBeGreaterThan(0);
  });
});

describe('flusher', () => {
  it('drains the spool back to Kafka when ready', async () => {
    const spool = buildInMemorySpool();
    const kafka = buildInMemoryKafkaPublisher();
    await spool.write(event('ws-a', 'v-1', 'view'));
    await spool.write(event('ws-a', 'v-1', 'view'));
    const stop = buildFlusher(spool, kafka, 50);
    // Wait one tick.
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(kafka.published.length).toBe(2);
    expect((await spool.list()).length).toBe(0);
  });

  it('leaves events in place when Kafka is not ready', async () => {
    const spool = buildInMemorySpool();
    const failing = {
      ready: () => false,
      publish: async () => {
        throw new Error('not ready');
      },
      publishMany: async () => {
        throw new Error('not ready');
      },
      publishRaw: async () => {
        throw new Error('not ready');
      },
      disconnect: async () => {
        /* no-op */
      },
    };
    await spool.write(event('ws-a', 'v-1', 'view'));
    const stop = buildFlusher(spool, failing, 50);
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect((await spool.list()).length).toBe(1);
  });
});
