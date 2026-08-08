/**
 * Live-analytics — WebSocket fan-out hub tests (Phase 17 W10).
 *
 * Verifies subscribe/unsubscribe lifecycle, broadcast fan-out, and
 * the close-channel final-pulse semantic.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildHub } from './hub.js';
import type { LivePulse } from '../types.js';

const basePulse: LivePulse = {
  workspace_id: 'ws-1',
  session_id: 'sess-1',
  ts_ms: 1_700_000_000_000,
  concurrent_viewers: 0,
  current_slide_id: null,
  reaction_count: 0,
  poll_vote_count: 0,
  last_seq: 0,
};

describe('buildHub', () => {
  it('registers subscribers per session', () => {
    const hub = buildHub();
    expect(hub.subscribersFor('ws-1', 'sess-1')).toBe(0);
    hub.subscribe('ws-1', 'sess-1', () => {});
    hub.subscribe('ws-1', 'sess-1', () => {});
    expect(hub.subscribersFor('ws-1', 'sess-1')).toBe(2);
    expect(hub.totalSubscribers()).toBe(2);
  });

  it('broadcasts a pulse to every subscriber of a session', () => {
    const hub = buildHub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe('ws-1', 'sess-1', a);
    hub.subscribe('ws-1', 'sess-1', b);
    const pulse: LivePulse = { ...basePulse, concurrent_viewers: 5 };
    hub.broadcast('ws-1', 'sess-1', pulse);
    expect(a).toHaveBeenCalledWith(pulse);
    expect(b).toHaveBeenCalledWith(pulse);
  });

  it('does not leak events across sessions', () => {
    const hub = buildHub();
    const a = vi.fn();
    hub.subscribe('ws-1', 'sess-1', a);
    hub.broadcast('ws-1', 'sess-2', basePulse);
    expect(a).not.toHaveBeenCalled();
  });

  it('removes subscribers when unsubscribed', () => {
    const hub = buildHub();
    const id = hub.subscribe('ws-1', 'sess-1', () => {});
    expect(hub.subscribersFor('ws-1', 'sess-1')).toBe(1);
    hub.unsubscribe('ws-1', 'sess-1', id);
    expect(hub.subscribersFor('ws-1', 'sess-1')).toBe(0);
  });

  it('close() sends a final zeroed pulse and removes the channel', () => {
    const hub = buildHub();
    const a = vi.fn();
    hub.subscribe('ws-1', 'sess-1', a);
    hub.close('ws-1', 'sess-1');
    expect(a).toHaveBeenCalledTimes(1);
    const call = a.mock.calls[0]?.[0] as LivePulse;
    expect(call.concurrent_viewers).toBe(0);
    expect(call.current_slide_id).toBeNull();
    expect(hub.subscribersFor('ws-1', 'sess-1')).toBe(0);
  });

  it('broadcast swallows per-subscriber errors', () => {
    const hub = buildHub();
    const a = vi.fn(() => {
      throw new Error('subscriber boom');
    });
    const b = vi.fn();
    hub.subscribe('ws-1', 'sess-1', a);
    hub.subscribe('ws-1', 'sess-1', b);
    expect(() => hub.broadcast('ws-1', 'sess-1', basePulse)).not.toThrow();
    expect(b).toHaveBeenCalled();
  });
});