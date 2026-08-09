/**
 * Built-in convergence scenarios for the CRDT bench.
 *
 * Each scenario is a named preset of `BenchOptions` that aims at a
 * specific load profile. The names are stable: they're what the
 * `perf-harness`/`bench-ci` wiring calls out by.
 */

import type { BenchOptions, BenchScenario } from './harness.js';

export interface ScenarioPreset {
  readonly name: BenchScenario;
  readonly description: string;
  readonly options: Omit<BenchOptions, 'scenario' | 'signal'>;
}

/**
 * 100 editors, 50 edits each, 10ms cadence. Smoke test.
 */
export const SCENARIO_TEXT_INSERT_SMOKE: ScenarioPreset = {
  name: 'text-insert',
  description: '100 editors × 50 edits × 10ms — quick sanity check.',
  options: {
    editorCount: 100,
    editsPerEditor: 50,
    editIntervalMs: 10,
  },
};

/**
 * 1000 editors, 50 edits each, 0ms cadence. The headline G1-4 scenario.
 * No artificial delay between edits — the harness loops in tight succession
 * to push the in-process relay to its convergence throughput limit.
 */
export const SCENARIO_MIXED_1K: ScenarioPreset = {
  name: 'mixed',
  description: '1000 editors × 50 mixed edits × 0ms — Phase 22-beta headline.',
  options: {
    editorCount: 1000,
    editsPerEditor: 50,
    editIntervalMs: 0,
  },
};

/**
 * 500 editors, 100 edits, 5ms cadence. Steady-state CI run.
 */
export const SCENARIO_SHAPE_ADD_CI: ScenarioPreset = {
  name: 'shape-add',
  description: '500 editors × 100 edits × 5ms — CI steady-state.',
  options: {
    editorCount: 500,
    editsPerEditor: 100,
    editIntervalMs: 5,
  },
};

/**
 * 100 editors, 1000 edits, 1ms cadence. Soak test for memory leaks.
 */
export const SCENARIO_TEXT_INSERT_SOAK: ScenarioPreset = {
  name: 'text-insert',
  description: '100 editors × 1000 edits × 1ms — soak / leak detection.',
  options: {
    editorCount: 100,
    editsPerEditor: 1000,
    editIntervalMs: 1,
  },
};

export const ALL_SCENARIOS: readonly ScenarioPreset[] = [
  SCENARIO_TEXT_INSERT_SMOKE,
  SCENARIO_MIXED_1K,
  SCENARIO_SHAPE_ADD_CI,
  SCENARIO_TEXT_INSERT_SOAK,
];

export function getScenario(name: BenchScenario, scale: 'smoke' | 'headline' | 'ci' | 'soak'): ScenarioPreset {
  if (name === 'mixed' && scale === 'headline') return SCENARIO_MIXED_1K;
  if (name === 'text-insert' && scale === 'soak') return SCENARIO_TEXT_INSERT_SOAK;
  if (name === 'shape-add' && scale === 'ci') return SCENARIO_SHAPE_ADD_CI;
  return SCENARIO_TEXT_INSERT_SMOKE;
}
