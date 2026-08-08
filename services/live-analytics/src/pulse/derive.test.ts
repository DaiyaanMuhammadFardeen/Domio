/**
 * Live-analytics — pulse derivation tests (Phase 17 W10).
 *
 * Verifies concurrent viewer counting, slide-change derivation,
 * cumulative reaction counts, and the summary aggregator.
 */

import { describe, it, expect } from 'vitest';
import { derivePulse, deriveSummary } from './derive.js';
import type { LiveEvent } from '../types.js';

function ev(
  seq: number,
  kind: LiveEvent['kind'],
  opts: Partial<LiveEvent> = {},
): LiveEvent {
  return {
    seq,
    ts_ms: opts.ts_ms ?? 1_700_000_000_000 + seq * 1000,
    workspace_id: opts.workspace_id ?? 'ws-1',
    session_id: opts.session_id ?? 'sess-1',
    deck_id: opts.deck_id ?? 'deck-1',
    viewer_id_key: opts.viewer_id_key ?? '',
    kind,
    ...opts,
  };
}

describe('derivePulse', () => {
  it('counts concurrent viewers from join/leave pairs', () => {
    const events: LiveEvent[] = [
      ev(1, 'viewer_join', { viewer_id_key: 'v1' }),
      ev(2, 'viewer_join', { viewer_id_key: 'v2' }),
      ev(3, 'viewer_join', { viewer_id_key: 'v3' }),
      ev(4, 'viewer_leave', { viewer_id_key: 'v2' }),
    ];
    const pulse = derivePulse('ws-1', 'sess-1', events);
    expect(pulse.concurrent_viewers).toBe(2);
    expect(pulse.last_seq).toBe(4);
  });

  it('picks the slide with the largest cohort and breaks ties by ts', () => {
    const events: LiveEvent[] = [
      ev(1, 'slide_change', { data: 'slide-A' }),
      ev(2, 'slide_change', { data: 'slide-A' }),
      ev(3, 'slide_change', { data: 'slide-B' }),
      ev(4, 'slide_change', { data: 'slide-C' }),
      ev(5, 'slide_change', { data: 'slide-C' }),
      ev(6, 'slide_change', { data: 'slide-C', ts_ms: 1_700_000_099_000 }),
    ];
    const pulse = derivePulse('ws-1', 'sess-1', events);
    expect(pulse.current_slide_id).toBe('slide-C');
  });

  it('counts reactions and poll votes cumulatively', () => {
    const events: LiveEvent[] = [
      ev(1, 'reaction'),
      ev(2, 'reaction'),
      ev(3, 'poll_vote'),
      ev(4, 'reaction'),
    ];
    const pulse = derivePulse('ws-1', 'sess-1', events);
    expect(pulse.reaction_count).toBe(3);
    expect(pulse.poll_vote_count).toBe(1);
  });

  it('returns zero counters for an empty window', () => {
    const pulse = derivePulse('ws-1', 'sess-1', []);
    expect(pulse.concurrent_viewers).toBe(0);
    expect(pulse.current_slide_id).toBeNull();
    expect(pulse.reaction_count).toBe(0);
    expect(pulse.poll_vote_count).toBe(0);
    expect(pulse.last_seq).toBe(0);
    expect(pulse.ts_ms).toBe(0);
  });
});

describe('deriveSummary', () => {
  it('computes peak concurrent across the stream', () => {
    const events: LiveEvent[] = [
      ev(1, 'viewer_join', { viewer_id_key: 'v1' }),
      ev(2, 'viewer_join', { viewer_id_key: 'v2' }),
      ev(3, 'viewer_join', { viewer_id_key: 'v3' }),
      ev(4, 'viewer_leave', { viewer_id_key: 'v1' }),
      ev(5, 'viewer_leave', { viewer_id_key: 'v2' }),
    ];
    const summary = deriveSummary(events);
    expect(summary.peak_concurrent_viewers).toBe(3);
    expect(summary.unique_viewers).toBe(3);
  });

  it('averages dwell_ms from heartbeats', () => {
    const events: LiveEvent[] = [
      ev(1, 'heartbeat', { value_numeric: 1000 }),
      ev(2, 'heartbeat', { value_numeric: 2000 }),
      ev(3, 'heartbeat', { value_numeric: 3000 }),
    ];
    const summary = deriveSummary(events);
    expect(summary.average_dwell_ms).toBe(2000);
  });

  it('returns zeros for an empty stream', () => {
    const summary = deriveSummary([]);
    expect(summary.total_events).toBe(0);
    expect(summary.peak_concurrent_viewers).toBe(0);
    expect(summary.average_dwell_ms).toBe(0);
    expect(summary.duration_ms).toBe(0);
  });

  it('counts reactions, poll_votes, and annotations', () => {
    const events: LiveEvent[] = [
      ev(1, 'reaction'),
      ev(2, 'reaction'),
      ev(3, 'poll_vote'),
      ev(4, 'annotation'),
      ev(5, 'annotation'),
      ev(6, 'annotation'),
    ];
    const summary = deriveSummary(events);
    expect(summary.total_reactions).toBe(2);
    expect(summary.total_poll_votes).toBe(1);
    expect(summary.total_annotations).toBe(3);
  });
});