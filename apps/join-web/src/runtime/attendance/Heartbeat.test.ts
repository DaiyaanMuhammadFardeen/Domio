/**
 * Heartbeat tests — uses vitest fake timers.
 *
 * Per Wave 5 §S5.4 spec:
 *   start() → advance 5s → 1 tick
 *   advance another 5s → 2 ticks total
 *   stop() → advance 5s → no further ticks
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Heartbeat, type HeartbeatTick } from './Heartbeat';

describe('Heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onTick once after 5s, again after another 5s, and stops when stopped', () => {
    const ticks: HeartbeatTick[] = [];
    const hb = new Heartbeat();
    hb.onTick((t) => ticks.push(t));
    hb.start();

    // 4.999s: no tick yet
    vi.advanceTimersByTime(4_999);
    expect(ticks).toHaveLength(0);

    // 5s: first tick
    vi.advanceTimersByTime(1);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.sequence).toBe(1);
    expect(typeof ticks[0]?.ts).toBe('number');

    // 5s more (10s total): second tick
    vi.advanceTimersByTime(5_000);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]?.sequence).toBe(2);

    hb.stop();
    expect(hb.isRunning()).toBe(false);

    // After stop, no more ticks even if time advances.
    vi.advanceTimersByTime(5_000);
    expect(ticks).toHaveLength(2);
  });

  it('isRunning() reflects lifecycle', () => {
    const hb = new Heartbeat();
    expect(hb.isRunning()).toBe(false);
    hb.start();
    expect(hb.isRunning()).toBe(true);
    hb.stop();
    expect(hb.isRunning()).toBe(false);
  });

  it('start() is idempotent — does not double-fire', () => {
    const ticks: HeartbeatTick[] = [];
    const hb = new Heartbeat();
    hb.onTick((t) => ticks.push(t));
    hb.start();
    hb.start(); // no-op
    vi.advanceTimersByTime(5_000);
    expect(ticks).toHaveLength(1);
  });

  it('stop() is safe to call when not running', () => {
    const hb = new Heartbeat();
    expect(() => hb.stop()).not.toThrow();
  });

  it('supports multiple listeners and unsubscribing', () => {
    const a: HeartbeatTick[] = [];
    const b: HeartbeatTick[] = [];
    const hb = new Heartbeat();
    const offA = hb.onTick((t) => a.push(t));
    hb.onTick((t) => b.push(t));
    hb.start();
    vi.advanceTimersByTime(5_000);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    offA();
    vi.advanceTimersByTime(5_000);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});
