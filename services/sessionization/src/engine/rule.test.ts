import { describe, it, expect } from 'vitest';
import { buildSessionEngine, deriveSessionId } from './rule.js';
import type { AnalyticsEvent } from '@domio/event-ingest';

function event(opts: Partial<AnalyticsEvent> & Pick<AnalyticsEvent, 'ts_ms' | 'workspace_id' | 'viewer_id_key' | 'event_id' | 'deck_id'>): AnalyticsEvent {
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

describe('buildSessionEngine', () => {
  it('starts a session on first event', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    const out = engine.apply({
      workspace_id: 'ws-1',
      viewer_id_key: 'vk-1',
      event: event({ ts_ms: 1_000, event_id: 'e1', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    expect(out.emitted[0]?.type).toBe('session.started');
    expect(out.closed).toHaveLength(0);
    expect(out.upserted).toHaveLength(1);
    expect(out.upserted[0]?.event_count).toBe(1);
  });

  it('heartbeats on second event within the inactivity window', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    engine.apply({
      workspace_id: 'ws-1', viewer_id_key: 'vk-1',
      event: event({ ts_ms: 1_000, event_id: 'a', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    const out = engine.apply({
      workspace_id: 'ws-1', viewer_id_key: 'vk-1',
      event: event({ ts_ms: 1_000 + 60_000, event_id: 'b', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    expect(out.emitted[0]?.type).toBe('session.heartbeat');
    expect(out.upserted[0]?.event_count).toBe(2);
  });

  it('closes and restarts when the gap exceeds inactivityMs', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    const t1 = 1_000;
    const t2 = t1 + 31 * 60 * 1000;
    engine.apply({
      workspace_id: 'ws-1', viewer_id_key: 'vk-1',
      event: event({ ts_ms: t1, event_id: 'a', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    const out = engine.apply({
      workspace_id: 'ws-1', viewer_id_key: 'vk-1',
      event: event({ ts_ms: t2, event_id: 'b', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    expect(out.emitted).toHaveLength(2);
    expect(out.emitted[0]?.type).toBe('session.ended');
    if (out.emitted[0]?.type === 'session.ended') {
      expect(out.emitted[0].reason).toBe('inactivity');
    }
    expect(out.emitted[1]?.type).toBe('session.started');
    expect(out.closed).toHaveLength(1);
  });

  it('closes when the session exceeds maxSessionMs even with heartbeats', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    const t1 = 1_000;
    // Build up to exactly 240 minutes (within maxSessionMs), then push
    // one more event 1 minute later so the duration crosses 4h.
    const minute = 60_000;
    const limit = cfg_maxMs();
    for (let i = 0; i < limit / minute; i += 1) {
      engine.apply({
        workspace_id: 'ws-1', viewer_id_key: 'vk-1',
        event: event({ ts_ms: t1 + i * minute, event_id: `e${i}`, workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
      });
    }
    // i minute after the last event: duration = limit + 1 min > 4h.
    const out = engine.apply({
      workspace_id: 'ws-1', viewer_id_key: 'vk-1',
      event: event({ ts_ms: t1 + (limit / minute + 1) * minute, event_id: 'final', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }),
    });
    expect(out.emitted.some((e) => e.type === 'session.ended' && e.reason === 'max_duration')).toBe(true);
  });

function cfg_maxMs(): number {
  return 4 * 60 * 60 * 1000;
}

  it('keeps separate sessions per viewer within the same workspace', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    const out1 = engine.apply({ workspace_id: 'ws-1', viewer_id_key: 'vk-1', event: event({ ts_ms: 100, event_id: 'a', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }) });
    const out2 = engine.apply({ workspace_id: 'ws-1', viewer_id_key: 'vk-2', event: event({ ts_ms: 100, event_id: 'b', workspace_id: 'ws-1', viewer_id_key: 'vk-2', deck_id: 'd1' }) });
    expect(out1.upserted[0]?.session_id).not.toBe(out2.upserted[0]?.session_id);
    expect(engine.size()).toBe(2);
  });

  it('deriveSessionId is deterministic', () => {
    const a = deriveSessionId('ws-1', 'vk-1', 1000);
    const b = deriveSessionId('ws-1', 'vk-1', 1000);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const c = deriveSessionId('ws-1', 'vk-1', 1001);
    expect(a).not.toBe(c);
  });

  it('evictStale closes idle sessions and leaves fresh ones', () => {
    const engine = buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 });
    engine.apply({ workspace_id: 'ws-1', viewer_id_key: 'vk-1', event: event({ ts_ms: 1_000, event_id: 'a', workspace_id: 'ws-1', viewer_id_key: 'vk-1', deck_id: 'd1' }) });
    engine.apply({ workspace_id: 'ws-1', viewer_id_key: 'vk-2', event: event({ ts_ms: 100_000, event_id: 'b', workspace_id: 'ws-1', viewer_id_key: 'vk-2', deck_id: 'd1' }) });
    const out = engine.evictStale(1_000 + 31 * 60 * 1000);
    expect(out.closed.map((c) => c.viewer_id_key)).toEqual(['vk-1']);
    expect(out.closed[0]?.ended_at_ms).toBe(1_000);
    expect(engine.size()).toBe(1);
  });
});