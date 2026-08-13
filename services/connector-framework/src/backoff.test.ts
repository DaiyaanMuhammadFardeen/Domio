/**
 * Backoff and circuit breaker tests (Phase 08).
 */

import { describe, it, expect, vi } from 'vitest';
import { backoffDelay, CircuitBreaker, withRetry } from './backoff.js';
import { CircuitOpenError } from './types.js';

// ---------------------------------------------------------------------------
// backoffDelay
// ---------------------------------------------------------------------------

describe('backoffDelay', () => {
  const baseConfig = { baseMs: 100, maxMs: 30_000, maxAttempts: 5, jitterFactor: 0.3 };

  it('returns non-negative value', () => {
    for (let i = 0; i < 100; i++) {
      const delay = backoffDelay(i, baseConfig);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it('stays within maxMs bound', () => {
    for (let i = 0; i < 100; i++) {
      const delay = backoffDelay(i, baseConfig);
      expect(delay).toBeLessThanOrEqual(baseConfig.maxMs);
    }
  });

  it('jitter factor 0 produces deterministic values', () => {
    const noJitter = { ...baseConfig, jitterFactor: 0 };
    const d0 = backoffDelay(0, noJitter);
    const d1 = backoffDelay(1, noJitter);
    const d2 = backoffDelay(2, noJitter);
    expect(d0).toBe(100);
    expect(d1).toBe(200);
    expect(d2).toBe(400);
  });

  it('exponential growth pattern (without jitter)', () => {
    const noJitter = { ...baseConfig, jitterFactor: 0 };
    for (let i = 0; i < 5; i++) {
      const delay = backoffDelay(i, noJitter);
      const expected = Math.min(100 * Math.pow(2, i), baseConfig.maxMs);
      expect(delay).toBe(Math.round(expected));
    }
  });

  it('with jitter, delays vary but stay within bounds', () => {
    const delays = Array.from({ length: 50 }, () => backoffDelay(3, baseConfig));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    // With jitter=0.3, the delay varies ±30% around 800
    // Allow some margin for randomness
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(baseConfig.maxMs);
    // Should have some variation
    expect(max - min).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker('postgres');
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after N failures', () => {
    const cb = new CircuitBreaker('postgres', {
      failureThreshold: 3,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    cb.recordFailure();
    expect(cb.getState()).toBe('closed');

    cb.recordFailure();
    expect(cb.getState()).toBe('closed');

    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('assertCanExecute throws CircuitOpenError when open', () => {
    const cb = new CircuitBreaker('mysql', {
      failureThreshold: 2,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    expect(() => cb.assertCanExecute()).toThrow(CircuitOpenError);
  });

  it('transitions to half-open after cooldown', () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker('rest', {
      failureThreshold: 2,
      cooldownMs: 5000,
      halfOpenSuccessThreshold: 1,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    // Before cooldown
    vi.advanceTimersByTime(4000);
    expect(cb.getState()).toBe('open');

    // After cooldown
    vi.advanceTimersByTime(1000);
    expect(cb.getState()).toBe('half-open');
    expect(cb.canExecute()).toBe(true);

    vi.useRealTimers();
  });

  it('recovers to closed after half-open successes', () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker('graphql', {
      failureThreshold: 2,
      cooldownMs: 5000,
      halfOpenSuccessThreshold: 2,
    });

    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(6000);
    expect(cb.getState()).toBe('half-open');

    cb.recordSuccess();
    expect(cb.getState()).toBe('half-open');

    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);

    vi.useRealTimers();
  });

  it('re-opens on failure during half-open', () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker('snowflake', {
      failureThreshold: 2,
      cooldownMs: 5000,
      halfOpenSuccessThreshold: 2,
    });

    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(6000);
    expect(cb.getState()).toBe('half-open');

    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    vi.useRealTimers();
  });

  it('successful call resets failure count', () => {
    const cb = new CircuitBreaker('google_sheets', {
      failureThreshold: 5,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');

    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');

    // Should need 5 more failures to open
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('returns result on success', async () => {
    const cb = new CircuitBreaker('rest');
    const result = await withRetry(async () => 'ok', cb);
    expect(result).toBe('ok');
  });

  it('retries on transient failure', async () => {
    const cb = new CircuitBreaker('postgres', {
      failureThreshold: 10,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'recovered';
      },
      cb,
      { baseMs: 1, maxMs: 10, maxAttempts: 5, jitterFactor: 0 },
    );

    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });

  it('throws after maxAttempts exhausted', async () => {
    const cb = new CircuitBreaker('mysql', {
      failureThreshold: 100,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    await expect(
      withRetry(
        async () => {
          throw new Error('always fail');
        },
        cb,
        { baseMs: 1, maxMs: 10, maxAttempts: 3, jitterFactor: 0 },
      ),
    ).rejects.toThrow('always fail');
  });

  it('short-circuits when circuit is open', async () => {
    const cb = new CircuitBreaker('notion', {
      failureThreshold: 2,
      cooldownMs: 60_000,
      halfOpenSuccessThreshold: 1,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    await expect(
      withRetry(async () => 'never', cb, { baseMs: 1, maxMs: 10, maxAttempts: 3, jitterFactor: 0 }),
    ).rejects.toThrow(CircuitOpenError);
  });
});
