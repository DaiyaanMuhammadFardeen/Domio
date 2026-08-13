/**
 * WidgetEngineConnector tests — bus subscription + frame routing.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AudienceEnvelope } from '@domio/protocol';
import {
  _resetWidgetBusForTests,
  connectWidgetEngine,
  pushWidgetFrame,
  useWidgetState,
} from './WidgetEngineConnector';

function frame(extra: { kind: AudienceEnvelope['kind']; widget_id: string } & Record<string, unknown>): AudienceEnvelope {
  const base: Record<string, unknown> = {
    ts_ms: Date.now(),
    participant_id: 'p1',
    idempotency_key: 'k',
    session_code: 'S',
  };
  for (const [k, v] of Object.entries(extra)) base[k] = v;
  return base as unknown as AudienceEnvelope;
}

describe('WidgetEngineConnector', () => {
  it('exposes an empty snapshot for an unknown widget', () => {
    _resetWidgetBusForTests();
    const { result } = renderHook(() => useWidgetState('missing'));
    expect(result.current.lastMessage).toBeNull();
    expect(result.current.state).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('updates snapshot when a frame is pushed to the bus', () => {
    _resetWidgetBusForTests();
    const { result } = renderHook(() => useWidgetState('w1'));
    act(() => {
      pushWidgetFrame('w1', frame({ kind: 'poll_vote', widget_id: 'w1', tally: { A: 1 } }));
    });
    expect(result.current.lastMessage).not.toBeNull();
  });

  it('records error frames as errors', () => {
    _resetWidgetBusForTests();
    const { result } = renderHook(() => useWidgetState('w1'));
    act(() => {
      pushWidgetFrame('w1', frame({ kind: 'error', widget_id: 'w1', message: 'boom' } as never));
    });
    expect(result.current.error).toBe('boom');
  });

  it('connectWidgetEngine forwards frames with a widget_id into the bus', () => {
    _resetWidgetBusForTests();
    let captured: ((f: AudienceEnvelope) => void) | null = null;
    const unsubscribe = vi.fn();
    const connector = connectWidgetEngine({
      subscribe: (cb) => {
        captured = cb;
        return unsubscribe;
      },
    });
    const { result } = renderHook(() => useWidgetState('w1'));
    act(() => {
      captured?.(frame({ kind: 'poll_vote', widget_id: 'w1' }));
    });
    expect(result.current.lastMessage).not.toBeNull();
    connector.disconnect();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('connectWidgetEngine ignores frames without a widget_id', () => {
    _resetWidgetBusForTests();
    let captured: ((f: AudienceEnvelope) => void) | null = null;
    const unsubscribe = vi.fn();
    const connector = connectWidgetEngine({
      subscribe: (cb) => {
        captured = cb;
        return unsubscribe;
      },
    });
    const { result } = renderHook(() => useWidgetState('w1'));
    act(() => {
      captured?.(frame({ kind: 'heartbeat', widget_id: '' } as never));
    });
    expect(result.current.lastMessage).toBeNull();
    connector.disconnect();
  });
});