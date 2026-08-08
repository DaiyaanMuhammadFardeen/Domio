/**
 * Domio analytics-sdk — Phase 17 implementation.
 *
 * Browser SDK that captures viewer/presenter/join-web runtime events,
 * applies device-side PII stripping, signs batches with HMAC-SHA256,
 * and posts to services/event-ingest via the configured transport.
 *
 * Architectural notes:
 *   * All events are constructed through the high-level `emit*` helpers
 *     (emitView, emitInteraction, emitScrollProgress, …) so the SDK
 *     controls partition keys, schema_version, and forward_compat flags.
 *   * The InMemoryTransport and MemoryQueueStore are exported so apps
 *     can swap transports in tests (we use them in vitest suites across
 *     the W1 integration tests).
 *   * PII stripping is applied at the SDK boundary BEFORE batching so
 *     the wire payload never contains raw email/phone/IP/name fields.
 *   * `doNotTrack` and `Sec-CH-Prefers-Reduced-Tracking` are honored
 *     at the SDK boundary — the SDK drops events entirely, never
 *     sending them to the ingest endpoint.
 */

export * from './types.js';
export * from './pii.js';
export * from './hmac.js';
export * from './batcher.js';
export * from './queue.js';
export * from './transport.js';
export * from './client.js';
export { stripPii } from './pii.js';
export { signBody, verifyBody } from './hmac.js';
