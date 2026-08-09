/**
 * @domio/rate-limit — types and constants.
 *
 * P20.5 B4 (rate limiting + abuse basics). Sliding-window rate limiter on
 * top of Redis (or in-memory for tests). Per-route defaults from §4.4.2 of
 * the phase doc.
 */

export type RateLimitKeyKind = 'ip' | 'user' | 'ip_user' | 'tenant';

export interface RateLimitRule {
  readonly route: string;
  readonly keyKind: RateLimitKeyKind;
  /** Maximum requests in the window. */
  readonly limit: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Remaining requests in the current window. */
  readonly remaining: number;
  /** When the current window resets (epoch ms). */
  readonly resetAt: number;
  /** Seconds until next allowed request (only set when `allowed = false`). */
  readonly retryAfterSeconds: number;
  /** The rule that produced this result. */
  readonly rule: RateLimitRule;
}

export interface RateLimiterOptions {
  /** Storage backend. In-memory by default. Redis adapter in production. */
  readonly store?: RateLimitStore;
  /** Optional clock for deterministic tests. */
  readonly clock?: () => Date;
}

// ---------------------------------------------------------------------------
// Defaults (P20.5 §4.4.2)
// ---------------------------------------------------------------------------

export const DEFAULT_RULES: readonly RateLimitRule[] = [
  { route: 'POST /auth/login', keyKind: 'ip', limit: 10, windowMs: 60_000 },
  { route: 'POST /auth/signup', keyKind: 'ip', limit: 5, windowMs: 3_600_000 },
  { route: 'POST /share/*', keyKind: 'user', limit: 30, windowMs: 60_000 },
  { route: 'POST /export/*', keyKind: 'user', limit: 10, windowMs: 60_000 },
  { route: 'GET /v1/*', keyKind: 'user', limit: 300, windowMs: 60_000 },
];

// ---------------------------------------------------------------------------
// Tenant-circuit-breaker
// ---------------------------------------------------------------------------

export interface CircuitBreakerState {
  readonly tenantId: string;
  readonly engaged: boolean;
  readonly engagedAt: Date | null;
  /** 5-minute rolling 5xx rate. */
  readonly errorRate: number;
  /** Soft throttle applied (default 0.1 = 10% of normal limits). */
  readonly throttleFactor: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class RateLimitStoreError extends Error {
  readonly code = 'RATE_LIMIT_STORE_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitStoreError';
  }
}

export class RateLimitValidationError extends Error {
  readonly code = 'RATE_LIMIT_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitValidationError';
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface RateLimitStore {
  /**
   * Increment the counter for the given key and return the new count and
   * the window's reset timestamp (epoch ms).
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /** Get the current count without incrementing. */
  peek(key: string): Promise<{ count: number; resetAt: number } | null>;
  /** Reset the counter for a key. */
  reset(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Circuit-breaker store
// ---------------------------------------------------------------------------

export interface CircuitBreakerStore {
  recordRequest(tenantId: string, statusCode: number): Promise<void>;
  getState(tenantId: string): Promise<CircuitBreakerState>;
  engage(tenantId: string, throttleFactor: number): Promise<void>;
  reset(tenantId: string): Promise<void>;
}