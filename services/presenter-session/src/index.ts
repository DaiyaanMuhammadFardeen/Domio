/**
 * @domio/presenter-session — public surface.
 *
 * Phase 15 W1. REST surface for the live presenter session row.
 *
 * Public exports:
 *   - {@link PresenterSessionService} — orchestration class.
 *   - REST handlers in `./handlers.js`.
 *   - Types & errors in `./types.js`.
 *   - State machine in `./state_machine.js`.
 *   - ETag helpers in `./etag.js`.
 *   - Audit emission in `./audit/emit.js`, key helper in `./audit/key.js`.
 *   - Idempotency store in `./idempotency/index.js`.
 *   - Store interface + in-memory + pg implementations in `./store/*`.
 *   - Dynamic plan reducer in `./dynamic_plan.js`.
 */

export * from './types.js';
export * from './service.js';
export * from './handlers.js';
export * from './etag.js';
export * from './state_machine.js';
export * from './dynamic_plan.js';
export * from './audit/emit.js';
export * from './audit/key.js';
export * from './handoff_token.js';
export * from './failover/election.js';
export * from './idempotency/index.js';
export * from './observability/metrics.js';
export * from './store/store.js';
export * from './store/mem_store.js';
export * from './store/pg_store.js';