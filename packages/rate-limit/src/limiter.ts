/**
 * @domio/rate-limit — limiter and middleware.
 *
 * P20.5 B4. Sliding-window rate limiter that consults a {@link RateLimitStore},
 * matches a route against the registered rules, and returns a
 * {@link RateLimitResult}. The middleware helper translates the result into
 * a 429 response with `Retry-After`.
 */

import type {
  RateLimitRule,
  RateLimitResult,
  RateLimiterOptions,
  RateLimitKeyKind,
  CircuitBreakerState,
  CircuitBreakerStore,
  RateLimitStore,
} from './types.js';
import { DEFAULT_RULES, RateLimitValidationError } from './types.js';
import { InMemoryRateLimitStore, InMemoryCircuitBreakerStore } from './stores.js';

// ---------------------------------------------------------------------------
// Caller context
// ---------------------------------------------------------------------------

export interface RateLimitCaller {
  readonly ip?: string;
  readonly userId?: string;
  readonly tenantId?: string;
}

// ---------------------------------------------------------------------------
// Limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly cb: CircuitBreakerStore;
  private readonly rules: Map<string, RateLimitRule>;

  constructor(opts: RateLimiterOptions = {}) {
    this.store = opts.store ?? new InMemoryRateLimitStore();
    this.cb = new InMemoryCircuitBreakerStore();
    this.rules = new Map();
    for (const r of DEFAULT_RULES) this.rules.set(r.route, r);
  }

  /** Register a custom rule (overrides the default for the matching route). */
  registerRule(rule: RateLimitRule): void {
    if (rule.limit < 1) throw new RateLimitValidationError('rule.limit must be >= 1');
    if (rule.windowMs < 1) throw new RateLimitValidationError('rule.windowMs must be >= 1');
    this.rules.set(rule.route, rule);
  }

  /** Look up the rule for a given route pattern. */
  matchRoute(route: string): RateLimitRule | undefined {
    if (this.rules.has(route)) return this.rules.get(route);
    // Glob-style match: "POST /share/*" matches "POST /share/abc"
    for (const [pattern, rule] of this.rules) {
      if (pattern.includes('*')) {
        const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        if (re.test(route)) return rule;
      }
    }
    return undefined;
  }

  /** Apply rate limit to a caller for a given route. */
  async limit(route: string, caller: RateLimitCaller): Promise<RateLimitResult> {
    const rule = this.matchRoute(route);
    if (!rule) {
      // No rule → allow (caller forgot to register)
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: Date.now(),
        retryAfterSeconds: 0,
        rule: { route, keyKind: 'ip', limit: 0, windowMs: 0 },
      };
    }

    // Apply tenant circuit-breaker throttle if engaged
    let throttleFactor = 1;
    if (caller.tenantId) {
      const state = await this.cb.getState(caller.tenantId);
      if (state.engaged) {
        throttleFactor = state.throttleFactor;
      }
    }

    const effectiveLimit = Math.max(1, Math.floor(rule.limit * throttleFactor));
    const key = buildKey(rule.keyKind, caller, route);
    const { count, resetAt } = await this.store.increment(key, rule.windowMs);

    if (count > effectiveLimit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds,
        rule,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, effectiveLimit - count),
      resetAt,
      retryAfterSeconds: 0,
      rule,
    };
  }

  /** Record a request outcome for circuit-breaker tracking. */
  async recordOutcome(tenantId: string, statusCode: number): Promise<void> {
    await this.cb.recordRequest(tenantId, statusCode);

    // Auto-engage if error rate exceeds threshold
    const state = await this.cb.getState(tenantId);
    if (!state.engaged && state.errorRate >= 0.5) {
      await this.cb.engage(tenantId, 0.1);
    }
  }

  /** Get current circuit-breaker state for a tenant. */
  async circuitBreakerState(tenantId: string): Promise<CircuitBreakerState> {
    return this.cb.getState(tenantId);
  }
}

// ---------------------------------------------------------------------------
// Key construction
// ---------------------------------------------------------------------------

function buildKey(kind: RateLimitKeyKind, caller: RateLimitCaller, route: string): string {
  switch (kind) {
    case 'ip':
      return `rl:ip:${caller.ip ?? '<unknown>'}:${route}`;
    case 'user':
      return `rl:user:${caller.userId ?? '<anonymous>'}:${route}`;
    case 'ip_user':
      return `rl:ip-user:${caller.ip ?? '<unknown>'}:${caller.userId ?? '<anonymous>'}:${route}`;
    case 'tenant':
      return `rl:tenant:${caller.tenantId ?? '<unknown>'}:${route}`;
  }
}

// ---------------------------------------------------------------------------
// HTTP middleware helper
// ---------------------------------------------------------------------------

export interface HttpMiddlewareResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
}

/**
 * Drop-in middleware for Express/Koa/Fastify-style HTTP frameworks.
 * Returns a 429 response with `Retry-After` when the limit is exceeded.
 */
export async function rateLimitMiddleware(
  limiter: RateLimiter,
  route: string,
  caller: RateLimitCaller,
): Promise<HttpMiddlewareResponse | null> {
  const result = await limiter.limit(route, caller);
  if (result.allowed) return null;
  return {
    status: 429,
    headers: {
      'Retry-After': String(result.retryAfterSeconds),
      'X-RateLimit-Limit': String(result.rule.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
      'content-type': 'application/json',
    },
    body: {
      error: 'rate_limit_exceeded',
      retryAfterSeconds: result.retryAfterSeconds,
    },
  };
}

// ---------------------------------------------------------------------------
// Anomaly detector
// ---------------------------------------------------------------------------

export const ANOMALY_THRESHOLD = 10;
export const ANOMALY_WINDOW_MS = 60_000;

/**
 * Track per-IP 429 bursts and return `true` if an IP hits the limit
 * `ANOMALY_THRESHOLD` times within `ANOMALY_WINDOW_MS`.
 *
 * Stateless across calls — caller owns the persistent counter (usually
 * the same Redis store).
 */
export class AnomalyDetector {
  private readonly hits = new Map<string, number[]>();
  /**
   * Inject a clock for tests.
   */
  constructor(private readonly clock: () => Date = () => new Date()) {}

  /** Record one 429 for an IP. Returns true if this triggered an anomaly. */
  record(ip: string): boolean {
    const now = this.clock().getTime();
    let arr = this.hits.get(ip);
    if (!arr) {
      arr = [];
      this.hits.set(ip, arr);
    }
    arr.push(now);
    while (arr.length > 0 && arr[0]! < now - ANOMALY_WINDOW_MS) arr.shift();
    return arr.length >= ANOMALY_THRESHOLD;
  }

  /** Test-only: reset all counters. */
  reset(): void {
    this.hits.clear();
  }
}