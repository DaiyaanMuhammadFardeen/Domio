/**
 * Drift budget: offset between audio clock and slide playhead.
 *
 * `withinBudget(offsetMs, budgetMs)` → whether the drift is within tolerance.
 * Drift correction strategy picker: resample vs pause-and-realign.
 */

// ─── Drift Budget ───────────────────────────────────────────────────────────

/** Default drift budget in milliseconds (spec: < 40ms per §8.5) */
export const DEFAULT_DRIFT_BUDGET_MS = 100;

/**
 * Check whether the absolute drift offset is within the allowed budget.
 *
 * @param offsetMs - Signed offset in ms (positive = audio ahead of playhead)
 * @param budgetMs - Allowed drift budget in ms (default 100)
 * @returns true if |offsetMs| <= budgetMs
 */
export function withinBudget(
  offsetMs: number,
  budgetMs: number = DEFAULT_DRIFT_BUDGET_MS,
): boolean {
  return Math.abs(offsetMs) <= budgetMs;
}

// ─── Strategy Picker ────────────────────────────────────────────────────────

export type DriftStrategy = 'resample' | 'pause-and-realign' | 'none';

/**
 * Select a drift correction strategy based on the absolute offset.
 *
 * - |offset| <= budget → 'none' (no correction needed)
 * - |offset| <= 2 × budget → 'resample' (gentle: speed up/slow down audio)
 * - |offset| > 2 × budget → 'pause-and-realign' (hard: pause and re-sync)
 *
 * @param offsetMs - Signed drift offset in ms
 * @param budgetMs - Drift budget in ms (default 100)
 */
export function pickDriftStrategy(
  offsetMs: number,
  budgetMs: number = DEFAULT_DRIFT_BUDGET_MS,
): DriftStrategy {
  const absOffset = Math.abs(offsetMs);

  if (absOffset <= budgetMs) {
    return 'none';
  }

  if (absOffset <= 2 * budgetMs) {
    return 'resample';
  }

  return 'pause-and-realign';
}

// ─── Drift Monitor ──────────────────────────────────────────────────────────

export interface DriftState {
  /** Last measured drift in ms */
  lastOffsetMs: number;
  /** Cumulative drift since last re-sync (for trending) */
  cumulativeMs: number;
  /** Number of re-syncs triggered */
  reSyncCount: number;
}

/**
 * Update drift state with a new measurement and determine if re-sync is needed.
 */
export function updateDrift(
  state: DriftState,
  newOffsetMs: number,
  budgetMs: number = DEFAULT_DRIFT_BUDGET_MS,
): { state: DriftState; needsReSync: boolean; strategy: DriftStrategy } {
  const strategy = pickDriftStrategy(newOffsetMs, budgetMs);
  const needsReSync = strategy === 'pause-and-realign';

  const newState: DriftState = {
    lastOffsetMs: newOffsetMs,
    cumulativeMs: state.cumulativeMs + Math.abs(newOffsetMs),
    reSyncCount: needsReSync ? state.reSyncCount + 1 : state.reSyncCount,
  };

  return { state: newState, needsReSync, strategy };
}
