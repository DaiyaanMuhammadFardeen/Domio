/**
 * SttClient tests — S5.5.
 *
 * Verifies that the mock STT client emits final results at the
 * configured cadence and that `close()` stops further emissions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, type SttResult } from './SttClient';

describe('SttClient.connect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onResult twice within 5 seconds', () => {
    const seen: SttResult[] = [];
    const session = connect({
      url: 'wss://stt.test/stream',
      onResult: (r) => seen.push(r),
      intervalMs: 2000,
    });
    expect(seen.length).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(seen.length).toBe(1);
    expect(seen[0]?.isFinal).toBe(true);
    expect(seen[0]?.text.length).toBeGreaterThan(0);
    vi.advanceTimersByTime(2000);
    expect(seen.length).toBe(2);
    session.close();
  });

  it('rotates through the supplied sample phrases', () => {
    const seen: string[] = [];
    const session = connect({
      url: 'wss://stt.test/stream',
      onResult: (r) => seen.push(r.text),
      intervalMs: 1000,
      samples: ['one', 'two', 'three'],
    });
    vi.advanceTimersByTime(3000);
    expect(seen).toEqual(['one', 'two', 'three']);
    session.close();
  });

  it('stops emitting after close()', () => {
    const seen: SttResult[] = [];
    const session = connect({
      url: 'wss://stt.test/stream',
      onResult: (r) => seen.push(r),
      intervalMs: 1000,
    });
    vi.advanceTimersByTime(1000);
    expect(seen.length).toBe(1);
    session.close();
    vi.advanceTimersByTime(5000);
    expect(seen.length).toBe(1);
  });

  it('feed() is a no-op that does not throw', () => {
    const session = connect({
      url: 'wss://stt.test/stream',
      onResult: () => {},
    });
    expect(() => session.feed(new ArrayBuffer(8))).not.toThrow();
    session.close();
  });
});
