/**
 * TimelineRuntime — drives a presentation sequence over a deck.
 *
 * Spec M6.2:
 *   - `interval_ms`, `pause_on_event`, `loop`, `count`,
 *     `interruption_policy: 'ignore' | 'queue' | 'abort'`.
 *   - `start()`, `pause()`, `resume()`, `currentSlide()`,
 *     `pausedTotalMs()`.
 *   - `tick(deltaMs)` — advances the sequence by a wall-clock delta.
 *     The runtime tracks `pausedTotalMs` (accumulated across pause
 *     events) and respects the `pause_warn_at_ms = 30 min` threshold.
 *   - `interruptionPolicy` matches the three handlers in
 *     `interruption-policy.ts`.
 *   - `prefers-reduced-motion: reduce` → sequence off by default.
 *   - Pause control is always visible (the editor binds a button to
 *     `pause()`/`resume()`).
 */

import type { InterruptionPolicy, PresentationSequence } from '../types.js';
import {
  applyInterruption,
  initialInterruptionState,
  type Interruption,
  type InterruptionPolicyState,
} from './interruption-policy.js';

export const DEFAULT_PAUSE_WARN_AT_MS = 30 * 60 * 1000; // 30 min
export const DEFAULT_INTERVAL_MS = 5_000;

export interface TimelineRuntimeOptions {
  readonly reducedMotion?: () => boolean;
  readonly clock?: () => number;
  /** Optional tick driver (replaces setTimeout for tests). */
  readonly onWarn?: (msPaused: number) => void;
}

interface InternalState {
  readonly seq: PresentationSequence;
  readonly interruptionState: InterruptionPolicyState;
  playing: boolean;
  pausedAt: number | null;
  pausedTotalMs: number;
  lastWarnAtMs: number;
  currentIndex: number;
  completedPlays: number;
  /** Number of times the active-slide native interval has elapsed. */
  intervalElapsedMs: number;
  /** Wall-clock ms elapsed since `start()` (NOT paused-adjusted). */
  wallClockMs: number;
}

export class TimelineRuntime {
  private readonly opts: Required<Omit<TimelineRuntimeOptions, 'onWarn'>> & {
    onWarn?: (msPaused: number) => void;
  };
  private state: InternalState | null = null;

  constructor(opts: TimelineRuntimeOptions = {}) {
    this.opts = {
      reducedMotion: opts.reducedMotion ?? (() => false),
      clock: opts.clock ?? (() => Date.now()),
      ...(opts.onWarn !== undefined ? { onWarn: opts.onWarn } : {}),
    };
  }

  /**
   * Start a sequence. Returns false if `prefers-reduced-motion: reduce`
   * is on AND `reducedMotionDefaultOff` is true; the runtime stays
   * idle in that case.
   */
  start(seq: PresentationSequence): boolean {
    if (seq.reducedMotionDefaultOff && this.opts.reducedMotion()) {
      this.state = null;
      return false;
    }
    if (seq.slides.length === 0) {
      this.state = null;
      return false;
    }
    this.state = {
      seq,
      interruptionState: initialInterruptionState(seq.interruptionPolicy),
      playing: true,
      pausedAt: null,
      pausedTotalMs: 0,
      lastWarnAtMs: 0,
      currentIndex: 0,
      completedPlays: 0,
      intervalElapsedMs: 0,
      wallClockMs: 0,
    };
    return true;
  }

  /**
   * Pause the sequence. Idempotent. Records the pause timestamp so
   * `resume()` can add the elapsed wall-clock to `pausedTotalMs`.
   */
  pause(): void {
    const s = this.state;
    if (!s || !s.playing || s.pausedAt !== null) return;
    s.pausedAt = this.opts.clock();
    s.playing = false;
  }

  /**
   * Resume the sequence. Idempotent. Returns the slide that was
   * paused on so the editor can re-display it.
   */
  resume(): string | null {
    const s = this.state;
    if (!s || s.playing) return null;
    if (s.pausedAt !== null) {
      const now = this.opts.clock();
      const pause = Math.max(0, now - s.pausedAt);
      s.pausedTotalMs += pause;
      s.pausedAt = null;
    }
    s.playing = true;
    return s.seq.slides[s.currentIndex] ?? null;
  }

  /** Currently displayed slide id, or null. */
  currentSlide(): string | null {
    const s = this.state;
    if (!s) return null;
    return s.seq.slides[s.currentIndex] ?? null;
  }

  /** Total ms spent paused across the lifetime of the runtime. */
  pausedTotalMs(): number {
    return this.state?.pausedTotalMs ?? 0;
  }

  /** Whether the runtime is currently playing. */
  isPlaying(): boolean {
    return this.state?.playing ?? false;
  }

  /** Whether the runtime has been aborted by an interruption. */
  isAborted(): boolean {
    return this.state?.interruptionState.aborted ?? false;
  }

  /** Interruptions queue length (for `queue` and `abort` policies). */
  queuedInterruptions(): readonly Interruption[] {
    return this.state?.interruptionState.queue ?? [];
  }

  /** Number of completed plays (used to enforce `count`). */
  completedPlays(): number {
    return this.state?.completedPlays ?? 0;
  }

  /**
   * Manually drive the runtime forward by `deltaMs` of wall-clock time.
   * Used in tests, in `tickManually`, and for manual advance.
   */
  tick(deltaMs: number): void {
    const s = this.state;
    if (!s || !s.playing) return;
    if (s.interruptionState.aborted) return;
    s.wallClockMs += deltaMs;
    s.intervalElapsedMs += deltaMs;
    const interval = s.seq.intervalMs > 0 ? s.seq.intervalMs : DEFAULT_INTERVAL_MS;
    while (s.intervalElapsedMs >= interval) {
      if (s.interruptionState.aborted) return;
      s.intervalElapsedMs -= interval;
      this.advanceSlide(s);
      if (!s.playing) return;
    }
  }

  /**
   * Notify the runtime that the user reduced their motion preference.
   * If `reducedMotionDefaultOff` is true and the runtime is playing,
   * it stops.
   */
  applyReducedMotion(reduced: boolean): void {
    const s = this.state;
    if (!s) return;
    if (reduced && s.seq.reducedMotionDefaultOff) {
      s.playing = false;
    }
  }

  /**
   * Record an external interruption (click, tap, hotspot fire).
   * The policy decides whether to queue, ignore, or abort.
   */
  interrupt(interruption: Omit<Interruption, 'at'>): InterruptionPolicyState {
    const s = this.state;
    if (!s) return initialInterruptionState('ignore');
    const at = this.opts.clock();
    const full: Interruption = { ...interruption, at };
    s.interruptionState = applyInterruption(s.interruptionState, full);
    return s.interruptionState;
  }

  /**
   * Record that the viewer has been paused for `msPaused` for the
   * purpose of firing the 30-minute warning. The runtime emits a
   * `onWarn` event the first time the threshold is crossed.
   */
  flagPauseProgress(msPaused: number): boolean {
    const s = this.state;
    if (!s) return false;
    const warnAt = s.seq.pauseWarnAtMs > 0 ? s.seq.pauseWarnAtMs : DEFAULT_PAUSE_WARN_AT_MS;
    if (msPaused >= warnAt && s.lastWarnAtMs < warnAt) {
      s.lastWarnAtMs = msPaused;
      this.opts.onWarn?.(msPaused);
      return true;
    }
    return false;
  }

  /** Returns the index of the current slide (0-based). */
  currentIndex(): number {
    return this.state?.currentIndex ?? 0;
  }

  /** Lifts the current state for inspection. */
  dumpState(): {
    readonly playing: boolean;
    readonly currentSlide: string | null;
    readonly currentIndex: number;
    readonly pausedTotalMs: number;
    readonly completedPlays: number;
    readonly interruptionPolicy: InterruptionPolicy;
    readonly queued: number;
    readonly aborted: boolean;
  } | null {
    const s = this.state;
    if (!s) return null;
    return {
      playing: s.playing,
      currentSlide: s.seq.slides[s.currentIndex] ?? null,
      currentIndex: s.currentIndex,
      pausedTotalMs: s.pausedTotalMs,
      completedPlays: s.completedPlays,
      interruptionPolicy: s.seq.interruptionPolicy,
      queued: s.interruptionState.queue.length,
      aborted: s.interruptionState.aborted,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private advanceSlide(s: InternalState): void {
    if (s.seq.slides.length === 0) return;
    const lastIndex = s.seq.slides.length - 1;
    if (s.currentIndex < lastIndex) {
      s.currentIndex += 1;
      return;
    }
    // End of this play.
    s.completedPlays += 1;
    if (s.seq.loop || (s.seq.count > 0 && s.completedPlays < s.seq.count)) {
      s.currentIndex = 0;
    } else {
      s.playing = false;
    }
  }
}
