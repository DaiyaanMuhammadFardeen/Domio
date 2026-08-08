/**
 * apps/presenter — Rehearsal engine.
 *
 * Tracks per-slide dwell time during a rehearsal run. Pacing targets
 * (ms per slide) can be supplied; the engine computes drift (actual -
 * target) and emits a color band:
 *   - ±10% of target → green
 *   - +10% / +25%   → yellow (over budget)
 *   - -10% / -25%   → blue (under budget)
 *   - outside ±25%  → red
 *
 * The engine is purely local — it ticks with `performance.now()` so it
 * doesn't drift due to throttled JS timers. The presenter-session
 * service persists `rehearsal_run` rows at end.
 */

export interface RehearsalPacingTarget {
  slide_id: string;
  target_ms: number;
}

export interface RehearsalTick {
  slide_id: string;
  elapsed_ms: number;
  target_ms: number | null;
  drift_ms: number;
  pace: 'green' | 'yellow' | 'blue' | 'red' | null;
}

const GREEN_BAND = 0.10;
const YELLOW_BAND = 0.25;

export function computePace(target_ms: number, elapsed_ms: number): RehearsalTick['pace'] {
  if (target_ms <= 0) return null;
  const ratio = elapsed_ms / target_ms;
  if (ratio >= 1 - GREEN_BAND && ratio <= 1 + GREEN_BAND) return 'green';
  if (ratio > 1 + GREEN_BAND && ratio <= 1 + YELLOW_BAND) return 'yellow';
  if (ratio < 1 - GREEN_BAND && ratio >= 1 - YELLOW_BAND) return 'blue';
  return 'red';
}

export function computeTick(
  slide_id: string,
  elapsed_ms: number,
  target_ms: number | null,
): RehearsalTick {
  const drift_ms = target_ms !== null ? elapsed_ms - target_ms : 0;
  const pace = target_ms !== null ? computePace(target_ms, elapsed_ms) : null;
  return { slide_id, elapsed_ms, target_ms, drift_ms, pace };
}

export interface RehearsalRunSummary {
  session_id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  total_ms: number;
  paused_ms: number;
  per_slide_ms: Record<string, number>;
  pacing_targets: Record<string, number>;
  completed: boolean;
}

export class RehearsalEngine {
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private currentSlideId: string | null = null;
  private currentSlideEnteredMs: number | null = null;
  private perSlideMs: Record<string, number> = {};
  private pacingTargets: Record<string, number> = {};
  private pausedMs = 0;
  private pausedAtMs: number | null = null;
  private completed = false;

  /** Begin a new rehearsal run. */
  start(sessionId: string): void {
    this.startedAtMs = performance.now();
    this.endedAtMs = null;
    this.perSlideMs = {};
    this.pausedMs = 0;
    this.pausedAtMs = null;
    this.completed = false;
    this.currentSlideId = null;
    this.currentSlideEnteredMs = null;
    this._startSlide(sessionId);
  }

  /** Move to a new slide. Finalizes the dwell on the previous slide. */
  advance(toSlideId: string): void {
    this._finalizeCurrentSlide();
    this._startSlide(toSlideId);
  }

  /** Pause the timer. */
  pause(): void {
    if (this.pausedAtMs !== null) return;
    this.pausedAtMs = performance.now();
  }

  /** Resume from a paused state. */
  resume(): void {
    if (this.pausedAtMs === null) return;
    this.pausedMs += performance.now() - this.pausedAtMs;
    this.pausedAtMs = null;
  }

  /** Set the pacing target for a slide (ms). */
  setTarget(slideId: string, targetMs: number): void {
    this.pacingTargets[slideId] = targetMs;
  }

  /** Mark the run as completed (reached the last slide). */
  markCompleted(): void {
    this.completed = true;
  }

  /** End the run. Returns the summary. */
  end(): RehearsalRunSummary {
    this._finalizeCurrentSlide();
    this.endedAtMs = performance.now();
    return {
      session_id: '', // Caller sets this — engine is session-agnostic.
      started_at_ms: this.startedAtMs ?? 0,
      ended_at_ms: this.endedAtMs,
      total_ms: this.endedAtMs !== null && this.startedAtMs !== null
        ? this.endedAtMs - this.startedAtMs - this.pausedMs
        : 0,
      paused_ms: this.pausedMs,
      per_slide_ms: { ...this.perSlideMs },
      pacing_targets: { ...this.pacingTargets },
      completed: this.completed,
    };
  }

  /** Quick read of the current tick (live). */
  currentTick(): RehearsalTick | null {
    if (this.currentSlideId === null || this.currentSlideEnteredMs === null) return null;
    const elapsed = this._currentSlideElapsedMs();
    const target = this.pacingTargets[this.currentSlideId] ?? null;
    return computeTick(this.currentSlideId, elapsed, target);
  }

  // -------------------------------------------------------------------------

  private _startSlide(slideId: string): void {
    this.currentSlideId = slideId;
    this.currentSlideEnteredMs = performance.now();
  }

  private _finalizeCurrentSlide(): void {
    if (this.currentSlideId === null || this.currentSlideEnteredMs === null) return;
    const dwell = this._currentSlideElapsedMs();
    this.perSlideMs[this.currentSlideId] = (this.perSlideMs[this.currentSlideId] ?? 0) + dwell;
    this.currentSlideId = null;
    this.currentSlideEnteredMs = null;
  }

  private _currentSlideElapsedMs(): number {
    if (this.currentSlideEnteredMs === null) return 0;
    const now = this.pausedAtMs ?? performance.now();
    return now - this.currentSlideEnteredMs;
  }
}