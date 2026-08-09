/**
 * @domio/crdt-bench — convergence benchmark for Yjs decks.
 *
 * Phase 22-beta G1-4. Use this to verify that the Yjs CRDT substrate
 * used by the editor and audience mode converges across thousands of
 * concurrent editors within a bounded latency budget.
 *
 * Quick start:
 *
 * ```ts
 * import { runConvergenceBench } from '@domio/crdt-bench/harness';
 * import { SCENARIO_MIXED_1K } from '@domio/crdt-bench/scenarios';
 * import { reportBench, serializeReport } from '@domio/crdt-bench/report';
 *
 * const result = await runConvergenceBench({
 *   ...SCENARIO_MIXED_1K.options,
 *   scenario: SCENARIO_MIXED_1K.name,
 * });
 * console.log(serializeReport(reportBench(result)));
 * ```
 */

export {
  createEditor,
  runConvergenceBench,
  percentile,
  type VirtualEditor,
  type EditorFactory,
  type BenchOptions,
  type BenchResult,
  type BenchScenario,
  type ConvergenceEvent,
} from './harness.js';

export {
  ALL_SCENARIOS,
  SCENARIO_TEXT_INSERT_SMOKE,
  SCENARIO_MIXED_1K,
  SCENARIO_SHAPE_ADD_CI,
  SCENARIO_TEXT_INSERT_SOAK,
  getScenario,
  type ScenarioPreset,
} from './scenarios.js';

export {
  reportBench,
  serializeReport,
  maskTimestamp,
  REPORT_SCHEMA_VERSION,
  type BenchReport,
} from './report.js';
