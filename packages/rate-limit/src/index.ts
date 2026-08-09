/**
 * @domio/rate-limit — public surface.
 *
 * P20.5 B4. Sliding-window rate limiter, anomaly detector, and circuit
 * breaker. In-memory store by default; production swaps in a Redis adapter.
 *
 * Public exports:
 *   - `RateLimiter` — main entry point.
 *   - `rateLimitMiddleware` — Express/Koa-style middleware.
 *   - `AnomalyDetector` — per-IP 429 burst detection.
 *   - `InMemoryRateLimitStore`, `InMemoryCircuitBreakerStore` — adapters.
 *   - `DEFAULT_RULES`, `ANOMALY_THRESHOLD`, `ANOMALY_WINDOW_MS` — constants.
 *   - Types and errors.
 */

export * from './types.js';
export * from './stores.js';
export * from './limiter.js';