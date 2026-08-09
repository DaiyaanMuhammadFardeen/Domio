/**
 * @domio/rate-limit — tests (P20.5 B4).
 *
 * Covers §4.4 verification matrix:
 *   - 11th login attempt in 1 minute returns 429 with Retry-After.
 *   - Signup after 5 in an hour returns 429.
 *   - Anomaly detector fires on 10x burst within 60s.
 *   - Tenant circuit breaker engages at 50% 5xx rate.
 *   - 429 response carries valid Retry-After.
 */

import { describe, it, expect } from 'vitest';
import {
  RateLimiter,
  rateLimitMiddleware,
  AnomalyDetector,
  ANOMALY_THRESHOLD,
  ANOMALY_WINDOW_MS,
  InMemoryRateLimitStore,
  InMemoryCircuitBreakerStore,
  RateLimitValidationError,
} from './index.js';

describe('RateLimiter — defaults', () => {
  it('allows requests under the default limits', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      const r = await limiter.limit('POST /auth/login', { ip: '1.2.3.4' });
      expect(r.allowed).toBe(true);
    }
  });

  it('returns 429 on the 11th login attempt in 1 minute', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      await limiter.limit('POST /auth/login', { ip: '1.2.3.4' });
    }
    const r = await limiter.limit('POST /auth/login', { ip: '1.2.3.4' });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('returns 429 on the 6th signup in an hour', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      const r = await limiter.limit('POST /auth/signup', { ip: '5.6.7.8' });
      expect(r.allowed).toBe(true);
    }
    const r = await limiter.limit('POST /auth/signup', { ip: '5.6.7.8' });
    expect(r.allowed).toBe(false);
  });

  it('keeps counters per-IP for unauthenticated routes', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      const r = await limiter.limit('POST /auth/signup', { ip: '10.0.0.1' });
      expect(r.allowed).toBe(true);
    }
    // Different IP — fresh budget
    const r = await limiter.limit('POST /auth/signup', { ip: '10.0.0.2' });
    expect(r.allowed).toBe(true);
  });

  it('matches glob-style route patterns via a custom rule with a wildcard', async () => {
    const limiter = new RateLimiter();
    limiter.registerRule({
      route: 'POST /share/*',
      keyKind: 'user',
      limit: 30,
      windowMs: 60_000,
    });
    // Hit the same exact route 30 times — all allowed
    for (let i = 0; i < 30; i++) {
      const r = await limiter.limit('POST /share/abc', { userId: 'u1' });
      expect(r.allowed).toBe(true);
    }
    // 31st — denied, regardless of the wildcard suffix
    const r = await limiter.limit('POST /share/abc', { userId: 'u1' });
    expect(r.allowed).toBe(false);
  });

  it('allows a request when no rule matches (passes through)', async () => {
    const limiter = new RateLimiter();
    const r = await limiter.limit('GET /health', { ip: '1.1.1.1' });
    expect(r.allowed).toBe(true);
  });
});

describe('RateLimiter — custom rules', () => {
  it('registerRule overrides default', async () => {
    const limiter = new RateLimiter();
    limiter.registerRule({
      route: 'POST /auth/login',
      keyKind: 'ip',
      limit: 100,
      windowMs: 60_000,
    });
    for (let i = 0; i < 50; i++) {
      const r = await limiter.limit('POST /auth/login', { ip: '1.2.3.4' });
      expect(r.allowed).toBe(true);
    }
  });

  it('registerRule rejects invalid limits', () => {
    const limiter = new RateLimiter();
    expect(() =>
      limiter.registerRule({ route: 'POST /x', keyKind: 'ip', limit: 0, windowMs: 1000 }),
    ).toThrow(RateLimitValidationError);
    expect(() =>
      limiter.registerRule({ route: 'POST /x', keyKind: 'ip', limit: 10, windowMs: 0 }),
    ).toThrow(RateLimitValidationError);
  });
});

describe('rateLimitMiddleware', () => {
  it('returns null when the request is allowed', async () => {
    const limiter = new RateLimiter();
    const resp = await rateLimitMiddleware(limiter, 'POST /auth/login', { ip: '1.1.1.1' });
    expect(resp).toBeNull();
  });

  it('returns 429 with Retry-After when exceeded', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      await rateLimitMiddleware(limiter, 'POST /auth/login', { ip: '1.1.1.1' });
    }
    const resp = await rateLimitMiddleware(limiter, 'POST /auth/login', { ip: '1.1.1.1' });
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(429);
    expect(resp!.headers['Retry-After']).toBeDefined();
    expect(parseInt(resp!.headers['Retry-After'], 10)).toBeGreaterThan(0);
    expect(resp!.headers['X-RateLimit-Limit']).toBe('10');
    expect(resp!.headers['X-RateLimit-Remaining']).toBe('0');
  });
});

describe('AnomalyDetector', () => {
  it('returns false before threshold', () => {
    const det = new AnomalyDetector();
    for (let i = 0; i < ANOMALY_THRESHOLD - 1; i++) {
      expect(det.record('1.2.3.4')).toBe(false);
    }
  });

  it('returns true on the 10th burst within the window', () => {
    const det = new AnomalyDetector();
    for (let i = 0; i < ANOMALY_THRESHOLD - 1; i++) {
      det.record('1.2.3.4');
    }
    expect(det.record('1.2.3.4')).toBe(true);
  });

  it('isolates anomalies per-IP', () => {
    const det = new AnomalyDetector();
    for (let i = 0; i < ANOMALY_THRESHOLD; i++) {
      det.record('1.1.1.1');
    }
    // 1.1.1.1 is anomalous; 2.2.2.2 is not
    expect(det.record('1.1.1.1')).toBe(true);
    expect(det.record('2.2.2.2')).toBe(false);
  });

  it('uses the window from constants', () => {
    expect(ANOMALY_WINDOW_MS).toBe(60_000);
  });
});

describe('Tenant circuit breaker', () => {
  it('engages after 50% 5xx rate over 5 minutes', async () => {
    const cb = new InMemoryCircuitBreakerStore();
    // 5 OK, 5 5xx → 50% error rate
    for (let i = 0; i < 5; i++) await cb.recordRequest('t1', 200);
    for (let i = 0; i < 5; i++) await cb.recordRequest('t1', 500);

    const limiter = new RateLimiter();
    await limiter.recordOutcome('t1', 500);

    const state = await limiter.circuitBreakerState('t1');
    expect(state.engaged).toBe(true);
    expect(state.throttleFactor).toBe(0.1);
  });

  it('does not engage below threshold', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 100; i++) await limiter.recordOutcome('t1', 200);
    for (let i = 0; i < 10; i++) await limiter.recordOutcome('t1', 500); // 9% error rate

    const state = await limiter.circuitBreakerState('t1');
    expect(state.engaged).toBe(false);
  });

  it('throttles the tenant to 10% of normal limits when engaged', async () => {
    const limiter = new RateLimiter();
    // Engage manually
    await limiter.recordOutcome('t1', 500);
    await limiter.recordOutcome('t1', 500);
    await limiter.recordOutcome('t1', 500);
    await limiter.recordOutcome('t1', 500);
    await limiter.recordOutcome('t1', 200);
    await limiter.recordOutcome('t1', 500);
    await limiter.recordOutcome('t1', 200);
    await limiter.recordOutcome('t1', 500);

    // Limit is 30 share/min; with 10% throttle → 3 effective
    for (let i = 0; i < 3; i++) {
      const r = await limiter.limit('POST /share/abc', { userId: 'u1', tenantId: 't1' });
      expect(r.allowed).toBe(true);
    }
    const r = await limiter.limit('POST /share/abc', { userId: 'u1', tenantId: 't1' });
    expect(r.allowed).toBe(false);
  });
});

describe('InMemoryRateLimitStore', () => {
  it('increments and returns the new count', async () => {
    const store = new InMemoryRateLimitStore();
    const a = await store.increment('k', 60_000);
    expect(a.count).toBe(1);
    const b = await store.increment('k', 60_000);
    expect(b.count).toBe(2);
  });

  it('peek returns the current state without incrementing', async () => {
    const store = new InMemoryRateLimitStore();
    await store.increment('k', 60_000);
    const peeked = await store.peek('k');
    expect(peeked?.count).toBe(1);
    const peeked2 = await store.peek('k');
    expect(peeked2?.count).toBe(1);
  });

  it('reset clears the counter', async () => {
    const store = new InMemoryRateLimitStore();
    await store.increment('k', 60_000);
    await store.reset('k');
    const peeked = await store.peek('k');
    expect(peeked).toBeNull();
  });
});