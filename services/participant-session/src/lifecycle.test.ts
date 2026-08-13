import { describe, expect, it, vi } from 'vitest';
import { InMemoryEdgeBus, decode } from '@domio/edge-pubsub';
import { LifecycleBroadcaster } from './lifecycle.js';

describe('lifecycle broadcaster', () => {
  it('emits a started event the first time it sees a session', async () => {
    const bus = new InMemoryEdgeBus();
    const seen: unknown[] = [];
    const origPublish = bus.publish.bind(bus);
    vi.spyOn(bus, 'publish').mockImplementation(async (input) => {
      seen.push(input);
      return origPublish(input);
    });
    const broadcaster = new LifecycleBroadcaster({
      bus,
      activeSessions: () => [
        {
          workspace_id: 'w1',
          session_id: 's1',
          active_count: 5,
          idle_count: 0,
          last_seen_at_ms: 1_000,
        },
      ],
      tickMs: 100_000,
      now: () => 1_000,
    });
    await broadcaster.tick();
    expect(seen).toHaveLength(1);
    const msg = seen[0] as { payload: Uint8Array };
    const decoded = decode(msg.payload) as { phase: string };
    expect(decoded.phase).toBe('started');
  });

  it('does not emit a duplicate started event on a second tick', async () => {
    const bus = new InMemoryEdgeBus();
    const broadcaster = new LifecycleBroadcaster({
      bus,
      activeSessions: () => [
        {
          workspace_id: 'w1',
          session_id: 's1',
          active_count: 5,
          idle_count: 0,
          last_seen_at_ms: 1_000,
        },
      ],
      now: () => 1_000,
    });
    const seen: unknown[] = [];
    const origPublish = bus.publish.bind(bus);
    vi.spyOn(bus, 'publish').mockImplementation(async (input) => {
      seen.push(input);
      return origPublish(input);
    });
    await broadcaster.tick();
    await broadcaster.tick();
    expect(seen).toHaveLength(1);
  });

  it('emits idle_warning once the soft TTL elapses', async () => {
    const bus = new InMemoryEdgeBus();
    const seen: unknown[] = [];
    const origPublish = bus.publish.bind(bus);
    vi.spyOn(bus, 'publish').mockImplementation(async (input) => {
      seen.push(input);
      return origPublish(input);
    });
    let nowMs = 1_000;
    const broadcaster = new LifecycleBroadcaster({
      bus,
      activeSessions: () => [
        {
          workspace_id: 'w1',
          session_id: 's1',
          active_count: 5,
          idle_count: 0,
          last_seen_at_ms: 1_000,
        },
      ],
      softTtlMs: 5_000,
      hardTtlMs: 60_000,
      now: () => nowMs,
    });
    await broadcaster.tick();
    nowMs = 7_000;
    await broadcaster.tick();
    const phases = seen.map(
      (s) => decode((s as { payload: Uint8Array }).payload) as { phase: string },
    );
    expect(phases.map((p) => p.phase)).toEqual(['started', 'idle_warning']);
  });

  it('emits ended once the hard TTL elapses', async () => {
    const bus = new InMemoryEdgeBus();
    const seen: unknown[] = [];
    const origPublish = bus.publish.bind(bus);
    vi.spyOn(bus, 'publish').mockImplementation(async (input) => {
      seen.push(input);
      return origPublish(input);
    });
    let nowMs = 1_000;
    const broadcaster = new LifecycleBroadcaster({
      bus,
      activeSessions: () => [
        {
          workspace_id: 'w1',
          session_id: 's1',
          active_count: 5,
          idle_count: 0,
          last_seen_at_ms: 1_000,
        },
      ],
      softTtlMs: 5_000,
      hardTtlMs: 10_000,
      now: () => nowMs,
    });
    await broadcaster.tick();
    nowMs = 12_000;
    await broadcaster.tick();
    const phases = seen.map(
      (s) => decode((s as { payload: Uint8Array }).payload) as { phase: string },
    );
    expect(phases.map((p) => p.phase)).toContain('ended');
  });

  it('start() and stop() control the timer', () => {
    const bus = new InMemoryEdgeBus();
    const broadcaster = new LifecycleBroadcaster({
      bus,
      activeSessions: () => [],
    });
    broadcaster.start();
    broadcaster.stop();
    broadcaster.start();
    broadcaster.stop();
  });
});
