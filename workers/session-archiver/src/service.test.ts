import { describe, expect, it } from 'vitest';
import { InMemoryEdgeBus, decode, encode } from '@domio/edge-pubsub';
import type { LifecycleEvent } from '@domio/participant-session';
import { SessionArchiver, InMemoryArchiveStore } from './index.js';

describe('session-archiver', () => {
  it('persists an archive on session.ended', async () => {
    const bus = new InMemoryEdgeBus();
    const store = new InMemoryArchiveStore();
    const archiver = new SessionArchiver({ bus, store });
    await archiver.registerSession('s1');

    const started: LifecycleEvent = {
      workspace_id: 'w1',
      session_id: 's1',
      phase: 'started',
      ts_ms: 1_000,
      active_count: 5,
      idle_count: 0,
    };
    const ended: LifecycleEvent = {
      workspace_id: 'w1',
      session_id: 's1',
      phase: 'ended',
      ts_ms: 6_000,
      active_count: 3,
      idle_count: 1,
    };

    await bus.publish({
      session_id: 's1',
      topic: 'lifecycle',
      payload: encode(started),
    });
    await bus.publish({
      session_id: 's1',
      topic: 'lifecycle',
      payload: encode(ended),
    });

    // Wait a tick for the handler to complete
    await new Promise((r) => setTimeout(r, 10));
    const archive = await store.get({ workspace_id: 'w1', session_id: 's1' });
    expect(archive).not.toBeNull();
    expect(archive?.peak_active).toBe(5);
    expect(archive?.ended_at_ms).toBe(6_000);
    expect(archiver.size()).toBe(0);
    void decode;
  });

  it('increments engagement counters', async () => {
    const bus = new InMemoryEdgeBus();
    const store = new InMemoryArchiveStore();
    const archiver = new SessionArchiver({ bus, store });
    archiver.incrementEngagement({
      workspace_id: 'w1',
      session_id: 's1',
      kind: 'poll_votes',
      by: 3,
    });
    archiver.incrementEngagement({ workspace_id: 'w1', session_id: 's1', kind: 'reactions' });
    expect(archiver.size()).toBe(1);
    // Doesn't error and is idempotent on shape
    await archiver.registerSession('s1');
    await archiver.unregisterSession('s1');
  });
});
