/**
 * Connector framework — retry / backoff / circuit breaker (Phase 08).
 *
 * Implements:
 * - Exponential backoff with jitter
 * - Circuit breaker (closed → open → half-open → closed)
 * - Configurable per-connector
 */

import type { ConnectorId } from './types.js';
import { CircuitOpenError } from './types.js';

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit. */
  readonly failureThreshold: number;
  /** Time in ms to stay open before going to half-open. */
  readonly cooldownMs: number;
  /** Number of successful half-open calls before closing. */
  readonly halfOpenSuccessThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastOpenedAt = 0;

  constructor(
    private readonly connector_id: ConnectorId,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG,
  ) {}

  getState(): CircuitState {
    if (this.state === 'open') {
      if (Date.now() - this.lastOpenedAt >= this.config.cooldownMs) {
        this.state = 'half-open';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    if (this.state === 'half-open') {
      this.state = 'open';
      this.lastOpenedAt = Date.now();
      this.successCount = 0;
    } else {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
        this.lastOpenedAt = Date.now();
      }
    }
  }

  canExecute(): boolean {
    const s = this.getState();
    return s === 'closed' || s === 'half-open';
  }

  assertCanExecute(): void {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.connector_id);
    }
  }
}

// ---------------------------------------------------------------------------
// Exponential backoff with jitter
// ---------------------------------------------------------------------------

export interface BackoffConfig {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
  /** Jitter factor 0..1 where 0 = no jitter, 1 = full random. */
  readonly jitterFactor: number;
}

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseMs: 100,
  maxMs: 30_000,
  maxAttempts: 5,
  jitterFactor: 0.3,
};

/**
 * Calculate the delay in ms for a given attempt (0-indexed).
 * Uses exponential backoff: base * 2^attempt, capped at maxMs.
 * Adds jitter: delay ± (delay * jitterFactor * random).
 */
export function backoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): number {
  const exp = Math.min(Math.pow(2, attempt), config.maxMs / config.baseMs);
  const base = config.baseMs * exp;
  const maxJitter = base * config.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * maxJitter;
  return Math.max(0, Math.min(config.maxMs, Math.round(base + jitter)));
}

/**
 * Execute an operation with retry + backoff + circuit breaker.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  circuit: CircuitBreaker,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    circuit.assertCanExecute();
    try {
      const result = await fn();
      circuit.recordSuccess();
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      circuit.recordFailure();
      if (attempt < config.maxAttempts - 1) {
        const delay = backoffDelay(attempt, config);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
