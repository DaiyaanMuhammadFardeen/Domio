import { describe, it, expect } from 'vitest';
import { buildSessionEmitter, InMemoryEmitterClient, subjectFor } from './emitter.js';
import type { SessionRecord } from '../types.js';

const session: SessionRecord = {
  session_id: 's1',
  workspace_id: 'ws-1',
  viewer_id_key: 'vk-1',
  deck_id: 'd1',
  state: 'open',
  started_at_ms: 1_000,
  last_event_at_ms: 1_000,
  ended_at_ms: null,
  event_count: 1,
  source_app: 'viewer',
  privacy_mode: 'pseudonymous',
  device_class: 'desktop',
  region_pinned: null,
  country_iso: null,
};

describe('buildSessionEmitter', () => {
  it('publishes started events to analytics.session.started.{ws}', async () => {
    const client = new InMemoryEmitterClient();
    const emitter = buildSessionEmitter(client);
    await emitter.emit({ type: 'session.started', session });
    expect(client.published[0]?.subject).toBe('analytics.session.started.ws-1');
  });

  it('publishes heartbeat events to analytics.session.heartbeat.{ws}', async () => {
    const client = new InMemoryEmitterClient();
    const emitter = buildSessionEmitter(client);
    await emitter.emit({ type: 'session.heartbeat', session });
    expect(client.published[0]?.subject).toBe('analytics.session.heartbeat.ws-1');
  });

  it('publishes ended events to analytics.session.ended.{ws}', async () => {
    const client = new InMemoryEmitterClient();
    const emitter = buildSessionEmitter(client);
    await emitter.emit({ type: 'session.ended', session, reason: 'inactivity' });
    expect(client.published[0]?.subject).toBe('analytics.session.ended.ws-1');
  });

  it('subjectFor maps lifecycle to subject suffix', () => {
    expect(subjectFor('session.started', session)).toBe('analytics.session.started.ws-1');
    expect(subjectFor('session.heartbeat', session)).toBe('analytics.session.heartbeat.ws-1');
    expect(subjectFor('session.ended', session)).toBe('analytics.session.ended.ws-1');
  });

  it('emitMany publishes every event in order', async () => {
    const client = new InMemoryEmitterClient();
    const emitter = buildSessionEmitter(client);
    await emitter.emitMany([
      { type: 'session.started', session },
      { type: 'session.heartbeat', session },
      { type: 'session.ended', session, reason: 'inactivity' },
    ]);
    expect(client.published.map((p) => p.subject)).toEqual([
      'analytics.session.started.ws-1',
      'analytics.session.heartbeat.ws-1',
      'analytics.session.ended.ws-1',
    ]);
  });
});