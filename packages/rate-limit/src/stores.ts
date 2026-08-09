/**
 * @domio/rate-limit — in-memory store.
 *
 * Used in tests and dev. Production uses the Redis adapter (separate
 * module to keep this package free of the redis client dep).
 */

import type { RateLimitStore, CircuitBreakerStore, CircuitBreakerState } from './types.js';

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    existing.count++;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async peek(key: string): Promise<{ count: number; resetAt: number } | null> {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= Date.now()) return null;
    return existing;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /** Test-only: clear all buckets. */
  clear(): void {
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------------------
// In-memory circuit breaker
// ---------------------------------------------------------------------------

const CB_WINDOW_MS = 5 * 60_000; // 5-minute rolling window
const CB_DEFAULT_THROTTLE = 0.1;

export class InMemoryCircuitBreakerStore implements CircuitBreakerStore {
  private readonly samples = new Map<string, Array<{ ts: number; is5xx: boolean }>>();
  private readonly states = new Map<string, CircuitBreakerState>();

  async recordRequest(tenantId: string, statusCode: number): Promise<void> {
    const now = Date.now();
    const is5xx = statusCode >= 500 && statusCode < 600;
    let arr = this.samples.get(tenantId);
    if (!arr) {
      arr = [];
      this.samples.set(tenantId, arr);
    }
    arr.push({ ts: now, is5xx });
    // Trim samples older than CB_WINDOW_MS
    while (arr.length > 0 && arr[0]!.ts < now - CB_WINDOW_MS) arr.shift();
  }

  async getState(tenantId: string): Promise<CircuitBreakerState> {
    const now = Date.now();
    const arr = this.samples.get(tenantId) ?? [];
    const recent = arr.filter((s) => s.ts >= now - CB_WINDOW_MS);
    if (recent.length === 0) {
      const existing = this.states.get(tenantId);
      return (
        existing ?? {
          tenantId,
          engaged: false,
          engagedAt: null,
          errorRate: 0,
          throttleFactor: 1,
        }
      );
    }
    const errors = recent.filter((s) => s.is5xx).length;
    const errorRate = errors / recent.length;
    const existing = this.states.get(tenantId);
    const isEngaged =
      existing?.engaged === true &&
      existing.engagedAt !== null &&
      existing.engagedAt.getTime() > now - CB_WINDOW_MS;
    return {
      tenantId,
      engaged: isEngaged,
      engagedAt: isEngaged ? existing!.engagedAt : null,
      errorRate,
      throttleFactor: isEngaged ? existing!.throttleFactor : 1,
    };
  }

  async engage(tenantId: string, throttleFactor: number = CB_DEFAULT_THROTTLE): Promise<void> {
    this.states.set(tenantId, {
      tenantId,
      engaged: true,
      engagedAt: new Date(),
      errorRate: 1,
      throttleFactor,
    });
  }

  async reset(tenantId: string): Promise<void> {
    this.states.delete(tenantId);
  }
}