/**
 * Jittered exponential backoff for WebSocket reconnection.
 *
 * Full jitter strategy: random delay in [0, min(maxDelay, base * 2^attempt)).
 * Base 300ms, max 15s. Each `next()` call returns the next delay; `reset()`
 * returns to the initial state.
 */

export interface BackoffOptions {
  /** Base delay in ms. @default 300 */
  baseMs?: number;
  /** Maximum delay in ms. @default 15_000 */
  maxMs?: number;
}

export function createBackoff(options: BackoffOptions = {}): {
  next: () => number;
  reset: () => void;
  attempt: () => number;
} {
  const base = options.baseMs ?? 300;
  const max = options.maxMs ?? 15_000;
  let attempt = 0;

  return {
    next(): number {
      const delay = Math.min(max, base * 2 ** attempt);
      const jittered = Math.random() * delay;
      attempt++;
      return jittered;
    },
    reset(): void {
      attempt = 0;
    },
    attempt(): number {
      return attempt;
    },
  };
}
