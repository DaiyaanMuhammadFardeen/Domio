/**
 * Domio prototype-runtime — Phase 10 implementation.
 *
 * This package is the in-process engine consumed by the editor preview,
 * the web viewer, and the (future) presenter. The persisted CRUD layer
 * lives in `services/prototype-runtime/`.
 *
 * Public surface:
 *   - expression: AST compiler + sandboxed evaluator
 *   - VarStore / BindingsDAG: typed, scoped, reactive variables
 *   - RuleEvaluator / ActionExecutor: priority + short-circuit rules
 *   - BranchingGraph / HotspotHitTester / OverlayStack: data-plane
 *     primitives consumed by the editor's Connections panel.
 */

export * from './types.js';
export * from './expression/index.js';
export * from './var-store.js';
export * from './bindings-dag.js';
export * from './rule-evaluator.js';
export * from './action-executor.js';
export {
  BranchingGraph,
  DEFAULT_MAX_HOPS,
  ESCAPE_ROOM_MAX_HOPS,
  type GraphNode,
  type GraphValidation,
} from './branching/graph.js';
export { HotspotHitTester, type PickResult } from './hotspot/hit-test.js';
export {
  OverlayStack,
  OVERLAY_MAX_DEPTH,
  OverlayStackFullError,
  OverlayNotOpenError,
} from './overlay/stack.js';
export * from './state-machines/index.js';
// Wave 2 §S2.12 — editor surfaces wired up here. Forms + device-frames
// are now part of the editor's import surface; see
// `apps/editor/src/components/prototyping/`.
export * from './forms/index.js';
export * from './device-frames/index.js';
