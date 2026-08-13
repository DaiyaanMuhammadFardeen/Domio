/**
 * RecordingSession timing logic.
 *
 * Tracks elapsed time and enforces two guards:
 * 1. **Max duration** — auto-stops recording when elapsed >= maxDurationMs
 *    (default 5 minutes per the doc spec).
 * 2. **Min guard** — discards recordings shorter than 1 second with a warning.
 *
 * All functions are pure math on timestamps — no real timers needed.
 */

export const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const MIN_DURATION_MS = 1_000; // 1 second

export interface TimingConfig {
  readonly maxDurationMs?: number;
}

export interface ElapsedResult {
  readonly elapsedMs: number;
  readonly stopped: false;
}

export interface StoppedResult {
  readonly stopped: true;
  readonly reason: 'max-duration';
  readonly elapsedMs: number;
}

export type TimingCheck = ElapsedResult | StoppedResult;

export interface MinGuardResult {
  readonly discarded: boolean;
  readonly warning: string | null;
}

/**
 * Compute elapsed time from a start timestamp to now.
 * If elapsed >= maxDurationMs, returns a StoppedResult.
 */
export function checkElapsed(startMs: number, nowMs: number, config?: TimingConfig): TimingCheck {
  const elapsedMs = nowMs - startMs;
  const maxMs = config?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  if (elapsedMs >= maxMs) {
    return { stopped: true, reason: 'max-duration', elapsedMs };
  }
  return { stopped: false, elapsedMs };
}

/**
 * Check if a recording meets the minimum duration requirement.
 * Returns a discard flag and warning message if too short.
 */
export function checkMinDuration(durationMs: number): MinGuardResult {
  if (durationMs < MIN_DURATION_MS) {
    return {
      discarded: true,
      warning: `Recording discarded: ${durationMs}ms is below the ${MIN_DURATION_MS}ms minimum.`,
    };
  }
  return { discarded: false, warning: null };
}
