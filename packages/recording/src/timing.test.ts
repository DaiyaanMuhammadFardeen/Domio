import { describe, it, expect } from 'vitest';
import {
  checkElapsed,
  checkMinDuration,
  DEFAULT_MAX_DURATION_MS,
  MIN_DURATION_MS,
} from './timing.js';

describe('checkElapsed', () => {
  it('returns elapsed time when under max duration', () => {
    const result = checkElapsed(0, 30_000);
    expect(result).toEqual({ stopped: false, elapsedMs: 30_000 });
  });

  it('returns stopped: true when elapsed >= default maxDuration (5 min)', () => {
    const nowMs = DEFAULT_MAX_DURATION_MS + 1;
    const result = checkElapsed(0, nowMs);
    expect(result.stopped).toBe(true);
    if (result.stopped) {
      expect(result.reason).toBe('max-duration');
      expect(result.elapsedMs).toBe(nowMs);
    }
  });

  it('returns stopped: true at exactly maxDurationMs', () => {
    const result = checkElapsed(0, DEFAULT_MAX_DURATION_MS);
    expect(result.stopped).toBe(true);
  });

  it('uses custom maxDurationMs when provided', () => {
    const result = checkElapsed(0, 10_000, { maxDurationMs: 10_000 });
    expect(result.stopped).toBe(true);
  });

  it('does not stop before custom maxDurationMs', () => {
    const result = checkElapsed(0, 9_999, { maxDurationMs: 10_000 });
    expect(result.stopped).toBe(false);
  });

  it('handles non-zero start timestamps', () => {
    const result = checkElapsed(5000, 50_000, { maxDurationMs: 60_000 });
    expect(result.stopped).toBe(false);
    if (!result.stopped) {
      expect(result.elapsedMs).toBe(45_000);
    }
  });

  it('stops when elapsed exceeds custom max with non-zero start', () => {
    const result = checkElapsed(10_000, 25_000, { maxDurationMs: 10_000 });
    expect(result.stopped).toBe(true);
  });
});

describe('checkMinDuration', () => {
  it('does not discard recordings >= 1 second', () => {
    const result = checkMinDuration(1000);
    expect(result.discarded).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('discards recordings < 1 second', () => {
    const result = checkMinDuration(500);
    expect(result.discarded).toBe(true);
    expect(result.warning).toContain('500ms');
    expect(result.warning).toContain(`${MIN_DURATION_MS}ms`);
  });

  it('does not discard recordings well above minimum', () => {
    const result = checkMinDuration(10_000);
    expect(result.discarded).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('discards recordings at 0ms', () => {
    const result = checkMinDuration(0);
    expect(result.discarded).toBe(true);
  });

  it('discards recordings at 999ms', () => {
    const result = checkMinDuration(999);
    expect(result.discarded).toBe(true);
  });

  it('accepts recordings at exactly 1000ms', () => {
    const result = checkMinDuration(1000);
    expect(result.discarded).toBe(false);
  });
});
