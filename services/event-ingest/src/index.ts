/**
 * @domio/event-ingest — public surface.
 *
 * Phase 17 W1.
 *
 * Public exports:
 *   - `buildApp(deps)` — Hono application factory.
 *   - `defaultDeps(cfg)` — wire production dependencies.
 *   - `loadConfigFromEnv()` — env → IngestConfig.
 *   - Validation: `buildValidator`, `buildPassthroughValidator`.
 *   - HMAC: `buildHmacVerifier`, `HMAC_HEADER_NAME`, etc.
 *   - Nonce: `buildMemoryNonceCache`, `buildRedisNonceCache`.
 *   - PII: `buildPiiStripper`, `buildNoopPiiStripper`.
 *   - Kafka: `buildKafkaPublisher`, `buildInMemoryKafkaPublisher`, `buildFailingKafkaPublisher`.
 *   - Spool: `buildDiskSpool`, `buildInMemorySpool`, `buildFlusher`.
 *   - NATS bridge: `buildNatsBridge`, `buildInMemoryNatsBridge`, `normalizeNatsEvent`.
 *   - DLQ: `buildDiskDlq`, `buildInMemoryDlq`, `dlqRecordToEvent`.
 *   - Metrics: `buildMetrics`, `buildInMemoryMetrics`.
 *   - Types: `AnalyticsEvent`, `IngestConfig`, etc.
 *   - Errors: `IngestError`, `SignatureError`, `ReplayError`, etc.
 */

export * from './types.js';
export * from './errors.js';
export * from './validation.js';
export * from './hmac.js';
export * from './nonce.js';
export * from './pii.js';
export * from './kafka.js';
export * from './spool.js';
export * from './nats_bridge.js';
export * from './dlq.js';
export * from './metrics/metrics.js';
export * from './server.js';
export * from './routes/events.js';
export * from './routes/health.js';
export * from './deps.js';
export { defaultDeps } from './default_deps.js';
export { handleNatsEvent } from './ingest_pipeline.js';
