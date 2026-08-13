/**
 * LowBandwidthFallback tests.
 *
 * Per Wave 5 §S5.9 spec:
 *   connect with wsUrl pointing to a deliberately failing endpoint
 *   advance 3s → verify state='longpoll'
 *   advance 5s → verify onMessage callback fires from poll (mock fetch)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, type TransportMessage } from './LowBandwidthFallback';

/** A WebSocket stub that never fires open; it accepts the URL so the
 *  transport doesn't fall back synchronously to polling. */
class FailingWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  close(): void {
    /* no-op */
  }
  send(): void {
    /* no-op */
  }
}

describe('LowBandwidthFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to long-poll when WS does not open within fallbackAfterMs', async () => {
    const messages: TransportMessage[] = [];
    let fetchCallCount = 0;
    const fetchMock = vi.fn(async () => {
      fetchCallCount += 1;
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]) as unknown as Headers,
        json: async () => ({ hello: 'world', n: fetchCallCount }),
      } as unknown as Response;
    });

    const t = connect({
      wsUrl: 'ws://invalid.test/never-opens',
      pollUrl: 'http://api.test/poll',
      fallbackAfterMs: 3_000,
      pollIntervalMs: 5_000,
      WebSocketCtor: FailingWebSocket as unknown as typeof WebSocket,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    // Subscribe AFTER connect so we observe all transitions.
    t.onMessage((m) => messages.push(m));

    // 1. While connecting: state is 'connecting'.
    expect(t.state).toBe('connecting');

    // 2. Advance just under the fallback window.
    vi.advanceTimersByTime(2_999);
    expect(t.state).toBe('connecting');

    // 3. Advance past the fallback window → state should flip to
    //    'longpoll' and the first poll should fire immediately.
    vi.advanceTimersByTime(2);
    expect(t.state).toBe('longpoll');

    // Let the immediate poll's microtask settle (await + json).
    await vi.advanceTimersByTimeAsync(0);

    // The first poll should have delivered the JSON payload to onMessage.
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect((messages[0]?.data as { hello: string }).hello).toBe('world');

    // 4. Advance one more poll interval → another fetch + message.
    const before = messages.length;
    await vi.advanceTimersByTimeAsync(5_001);
    expect(messages.length).toBeGreaterThan(before);

    t.close();
  });

  it('close() shuts everything down and sets state=offline', () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Map() as unknown as Headers,
          json: async () => ({}),
        }) as unknown as Response,
    );

    const t = connect({
      wsUrl: 'ws://invalid.test',
      pollUrl: 'http://api.test/poll',
      fallbackAfterMs: 1_000,
      pollIntervalMs: 5_000,
      WebSocketCtor: FailingWebSocket as unknown as typeof WebSocket,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    vi.advanceTimersByTime(1_500);
    expect(t.state).toBe('longpoll');
    t.close();
    expect(t.state).toBe('offline');
  });

  it('onStateChange fires the current state immediately on subscribe', () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({}) }) as unknown as Response,
    );
    const t = connect({
      wsUrl: 'ws://invalid.test',
      pollUrl: 'http://api.test/poll',
      WebSocketCtor: FailingWebSocket as unknown as typeof WebSocket,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    expect(states[0]).toBe('connecting');
    t.close();
  });
});
