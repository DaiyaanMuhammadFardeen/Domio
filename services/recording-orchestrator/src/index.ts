/**
 * @domio/recording-orchestrator — public surface.
 *
 * Phase 21 W1. Transport-agnostic orchestration of a recording session.
 *
 * Public exports:
 *   - {@link RecordingOrchestrator} — orchestration class.
 *   - Types & errors in `./types.js`.
 *   - Store interface + in-memory impl in `./store/store.js`.
 *   - Audit emission in `./audit/emit.js`.
 *   - Idempotency store in `./idempotency/index.js`.
 *   - Metrics emitter + metric names in `./observability/metrics.js`.
 */

export * from './types.js';
export * from './service.js';
export * from './audit/emit.js';
export * from './idempotency/index.js';
export * from './observability/metrics.js';
export * from './store/store.js';
