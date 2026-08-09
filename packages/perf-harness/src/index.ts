/**
 * @domio/perf-harness — public API.
 *
 * The harness is consumed by:
 *   - `apps/editor/perf/canvas_fps.spec.ts` (G1-3)
 *   - `packages/crdt-bench/` (G1-4)
 *   - `infra/loadtest/presenter_2h.js` integration (G1-5)
 */

export * from './frame.js';
export * from './replay.js';
export * from './report.js';
export * from './scenarios.js';
export * from './presenter-source.js';