/**
 * @domio/scenario-manager — Phase 08 scenario DAG, overlays, and diff.
 *
 * Public surface:
 *
 *  - {@link ScenarioService} — scenario CRUD with parent validation,
 *    overlay management, diff computation.
 *  - In-memory repositories for tests + dev fallback.
 *  - Errors with stable `.code` strings: `SCENARIO_CYCLE`,
 *    `SCENARIO_DEPTH_EXCEEDED`, `SCENARIO_NOT_FOUND`.
 */

export * from './dal.js';
export * from './dag.js';
export * from './overlays.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
