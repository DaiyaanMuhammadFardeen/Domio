/**
 * @domio/perf-harness — replay scenario presets.
 *
 * Each preset is a `ReplayScenario` shaped for one of the P22-beta
 * perf workstreams. The CI runs them at `timeScale > 1` so they
 * finish in seconds; the game-day run replays them at `timeScale=1`.
 */

import type { ReplayScenario } from './replay.js';

/**
 * Canvas FPS at 500 elements. Headline G1-3 scenario.
 *
 * Wall time: 60 min at real time, 6 min at timeScale=10.
 */
export const CANVAS_FPS_500_ELEMS_60M: ReplayScenario = {
  id: 'canvas-fps-500-elems-60m',
  durationMs: 60 * 60 * 1000,
  timeScale: 10,
  minFps: 55,
  jankToleranceMs: 5_000,
  memoryBudgetBytes: 256 * 1024 * 1024,
};

/**
 * CRDT convergence at 1k editors. Headline G1-4 scenario. Lives in
 * `@domio/crdt-bench` but exposed here for the unified perf dashboard.
 */
export const CRDT_CONVERGE_1K_EDITORS: ReplayScenario = {
  id: 'crdt-converge-1k-editors',
  durationMs: 5 * 60 * 1000,
  timeScale: 10,
  minFps: 0,
  memoryBudgetBytes: 512 * 1024 * 1024,
};

/**
 * Presenter 2-hour stability. Headline G1-5 scenario. Replays the
 * same pattern as `infra/loadtest/presenter_2h.js` (60 slides, polls
 * every 5th, 120s cadence), but in-process against a synthetic frame
 * source so CI can finish in <30 seconds.
 *
 * Wall time: 2 h at real time, ~12 s at timeScale=600.
 */
export const PRESENTER_2H_STABILITY: ReplayScenario = {
  id: 'presenter-2h-stability',
  durationMs: 2 * 60 * 60 * 1000,
  timeScale: 600,
  minFps: 30,
  jankToleranceMs: 30_000,
  memoryBudgetBytes: 384 * 1024 * 1024,
};

/**
 * All known P22-beta replay scenarios, in stable order.
 */
export const ALL_REPLAY_SCENARIOS: readonly ReplayScenario[] = [
  CANVAS_FPS_500_ELEMS_60M,
  CRDT_CONVERGE_1K_EDITORS,
  PRESENTER_2H_STABILITY,
];

/** Look up a scenario by id. */
export function getReplayScenario(id: string): ReplayScenario | undefined {
  return ALL_REPLAY_SCENARIOS.find((s) => s.id === id);
}
