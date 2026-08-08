/**
 * Tests for the NATS envelope normalizer (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { normalizeNatsEvent } from './nats_bridge.js';

describe('normalizeNatsEvent', () => {
  it('parses a rtgw/pwg envelope into a canonical AnalyticsEvent', () => {
    const env = {
      live_event_kind: 'crdt_state_apply',
      session_id: 'sess-1',
      deck_id: 'deck-1',
      workspace_id: 'ws-1',
      viewer_id_key: 'v-1',
      source_app: 'rtgw',
      ingest_topic: 'events.ingest.raw',
      ts_ms: 1700000000000,
      live_event_data: Buffer.from('hello').toString('base64'),
    };
    const event = normalizeNatsEvent(env, 'analytics.ingest.live.sess-1');
    expect(event.event_name).toBe('live_session_event');
    expect(event.live_event_kind).toBe('crdt_state_apply');
    expect(event.workspace_id).toBe('ws-1');
    expect(event.viewer_id_key).toBe('v-1');
    expect(event.session_id).toBe('sess-1');
    expect(event.live_event_data).toBe('hello');
    expect(event.event_id).toContain('analytics.ingest.live.sess-1');
  });

  it('falls back to participant_id when viewer_id_key is absent', () => {
    const env = {
      live_event_kind: 'poll_vote',
      session_id: 'sess-2',
      participant_id: 'p-1',
      ts_ms: 1700000001000,
    };
    const event = normalizeNatsEvent(env, 'analytics.ingest.live.sess-2');
    expect(event.viewer_id_key).toBe('p-1');
  });

  it('throws when given a non-object', () => {
    expect(() => normalizeNatsEvent('not an object', 'x')).toThrow();
    expect(() => normalizeNatsEvent(null, 'x')).toThrow();
  });
});