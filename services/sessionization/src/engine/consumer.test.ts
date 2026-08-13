import { describe, it, expect } from 'vitest';
import { buildPartitionConsumer, buildSessionEngine } from '../index.js';
import type { AnalyticsEvent } from '@domio/event-ingest';
import type { SessionEvent, SessionRecord } from '../types.js';

function event(
  opts: Partial<AnalyticsEvent> &
    Pick<AnalyticsEvent, 'ts_ms' | 'event_id' | 'deck_id' | 'workspace_id' | 'viewer_id_key'>,
): AnalyticsEvent {
  return {
    event_name: 'view',
    schema_version: 1,
    privacy_mode: 'pseudonymous',
    device_class: 'desktop',
    source_app: 'viewer',
    ingest_topic: 'events.ingest.raw',
    ...opts,
  } as AnalyticsEvent;
}

describe('buildPartitionConsumer', () => {
  it('produces a deterministic session ID across replays', async () => {
    const events: AnalyticsEvent[] = [];
    const baseTs = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      events.push(
        event({
          ts_ms: baseTs + i * 60_000,
          event_id: `e${i}`,
          deck_id: 'd1',
          workspace_id: 'ws-1',
          viewer_id_key: 'vk-1',
        }),
      );
    }
    const run = async () => {
      const engine = buildSessionEngine({
        inactivityMs: 30 * 60 * 1000,
        maxSessionMs: 4 * 60 * 60 * 1000,
      });
      const captured: SessionRecord[] = [];
      const consumer = buildPartitionConsumer({
        engine,
        onUpsert: async (s) => {
          captured.push(s);
        },
        onClose: async () => {
          /* noop */
        },
        onEmit: async (_ev: SessionEvent) => {
          /* noop */
        },
      });
      await consumer.run(events);
      return captured;
    };
    const a = await run();
    const b = await run();
    expect(a.map((s) => s.session_id)).toEqual(b.map((s) => s.session_id));
    expect(a[0]?.session_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sorts events by ts_ms before applying, so late events get attributed to the right session', async () => {
    const consumer = buildPartitionConsumer({
      engine: buildSessionEngine({
        inactivityMs: 30 * 60 * 1000,
        maxSessionMs: 4 * 60 * 60 * 1000,
      }),
      onUpsert: async () => {},
      onClose: async () => {},
      onEmit: async () => {},
    });
    const base = 1_700_000_000_000;
    // Out of order: the second event has an earlier ts than the first.
    const result = await consumer.run([
      event({
        ts_ms: base + 60_000,
        event_id: 'b',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
      event({
        ts_ms: base,
        event_id: 'a',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
    ]);
    expect(result.processed).toBe(2);
    expect(result.started).toBe(1);
  });

  it('closes a session when a long gap forces a new one', async () => {
    const consumer = buildPartitionConsumer({
      engine: buildSessionEngine({
        inactivityMs: 30 * 60 * 1000,
        maxSessionMs: 4 * 60 * 60 * 1000,
      }),
      onUpsert: async () => {},
      onClose: async () => {},
      onEmit: async () => {},
    });
    const base = 1_700_000_000_000;
    const result = await consumer.run([
      event({
        ts_ms: base,
        event_id: 'a',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
      event({
        ts_ms: base + 31 * 60 * 1000,
        event_id: 'b',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
    ]);
    expect(result.closedByInactivity).toBe(1);
    expect(result.started).toBe(2);
  });

  it('counts multiple sessions and multiple workspaces independently', async () => {
    const consumer = buildPartitionConsumer({
      engine: buildSessionEngine({
        inactivityMs: 30 * 60 * 1000,
        maxSessionMs: 4 * 60 * 60 * 1000,
      }),
      onUpsert: async () => {},
      onClose: async () => {},
      onEmit: async () => {},
    });
    const base = 1_700_000_000_000;
    const result = await consumer.run([
      event({
        ts_ms: base,
        event_id: '1',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
      event({
        ts_ms: base + 60_000,
        event_id: '2',
        deck_id: 'd1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
      }),
      event({
        ts_ms: base,
        event_id: '3',
        deck_id: 'd1',
        workspace_id: 'ws-2',
        viewer_id_key: 'vk-1',
      }),
    ]);
    expect(result.started).toBe(2);
    expect(result.processed).toBe(3);
  });
});
