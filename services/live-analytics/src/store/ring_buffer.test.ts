/**
 * Live-analytics — ring buffer tests (Phase 17 W10).
 *
 * Verifies push ordering, eviction when the buffer is full, and the
 * session key isolation between workspaces.
 */

import { describe, it, expect } from 'vitest';
import { buildRingBuffer } from './ring_buffer.js';
import type { LiveEvent } from '../types.js';

function ev(session: string, seq: number): LiveEvent {
  return {
    seq,
    ts_ms: 1_700_000_000_000 + seq,
    workspace_id: 'ws-1',
    session_id: session,
    deck_id: 'deck-1',
    viewer_id_key: '',
    kind: 'heartbeat',
  };
}

describe('buildRingBuffer', () => {
  it('returns an empty snapshot for an unknown session', () => {
    const buf = buildRingBuffer(10);
    expect(buf.snapshot('ws-1', 'sess-1')).toEqual([]);
    expect(buf.size('ws-1', 'sess-1')).toBe(0);
  });

  it('preserves insertion order', () => {
    const buf = buildRingBuffer(10);
    for (let i = 1; i <= 5; i += 1) buf.push(ev('sess-1', i));
    const snapshot = buf.snapshot('ws-1', 'sess-1');
    expect(snapshot.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('evicts the oldest events when capacity is exceeded', () => {
    const buf = buildRingBuffer(3);
    for (let i = 1; i <= 5; i += 1) buf.push(ev('sess-1', i));
    expect(buf.size('ws-1', 'sess-1')).toBe(3);
    expect(buf.snapshot('ws-1', 'sess-1').map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it('keeps sessions isolated across workspaces', () => {
    const buf = buildRingBuffer(10);
    buf.push({ ...ev('sess-1', 1), workspace_id: 'ws-A' });
    buf.push({ ...ev('sess-1', 2), workspace_id: 'ws-B' });
    expect(buf.snapshot('ws-A', 'sess-1').map((e) => e.seq)).toEqual([1]);
    expect(buf.snapshot('ws-B', 'sess-1').map((e) => e.seq)).toEqual([2]);
  });

  it('drop() removes the session buffer and decrements sessionCount', () => {
    const buf = buildRingBuffer(10);
    buf.push(ev('sess-1', 1));
    buf.push(ev('sess-2', 2));
    expect(buf.sessionCount()).toBe(2);
    buf.drop('ws-1', 'sess-1');
    expect(buf.sessionCount()).toBe(1);
    expect(buf.snapshot('ws-1', 'sess-1')).toEqual([]);
  });
});