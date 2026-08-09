/**
 * @domio/perf-harness — synthetic presenter frame source.
 *
 * Mirrors the cadence of `infra/loadtest/presenter_2h.js`:
 *   - 60 slides over 2 hours → ~120s per slide
 *   - poll creation every 5th slide
 *   - heartbeat per frame
 *
 * The synthetic source emits one frame per "slide advance". Frame
 * duration is normally 16.6ms (60 fps) but we apply a slight jitter
 * so the replay detects frame-time regressions in CI as well as in
 * production.
 *
 * Time scaling comes from the `ReplayScenario.timeScale` field, not
 * the source itself — the source just emits frames at a fixed cadence
 * and the harness's wall-clock loop handles the scale.
 */

import type { FrameTickLike, FrameSourceLike } from './replay.js';

export interface SyntheticPresenterSourceOpts {
  /** Total slides to advance. Default 60. */
  readonly slideCount?: number;
  /** Frames-per-slide; default 60 (one second of 60fps per slide). */
  readonly framesPerSlide?: number;
  /** Base frame duration in ms (60fps = 16.667). Default 16.667. */
  readonly baseFrameMs?: number;
  /** Jitter amount in ms added/subtracted from baseFrameMs. Default 0.5. */
  readonly jitterMs?: number;
  /** Frame at which a poll fires (every Nth slide). Default 5. */
  readonly pollEverySlides?: number;
}

export interface SyntheticPresenterSource extends FrameSourceLike {
  /** Index of the next slide to advance. */
  nextSlide(): number;
  /** Number of polls created so far. */
  pollCount(): number;
  /** Whether the most recent frame was a "poll" frame. */
  lastFrameWasPoll(): boolean;
}

interface Tick extends FrameTickLike {
  readonly slideIndex: number;
  readonly isPoll: boolean;
}

/**
 * Create a synthetic presenter frame source. Each call to
 * `nextFrame()` yields a `FrameTickLike` with `frameIndex`,
 * `startMs`, `endMs`, `durationMs`. Use this with `runReplay` for
 * the in-process presenter stability replay.
 */
export function syntheticPresenterSource(
  opts: SyntheticPresenterSourceOpts = {},
): SyntheticPresenterSource {
  const slideCount = opts.slideCount ?? 60;
  const framesPerSlide = opts.framesPerSlide ?? 60;
  const baseFrameMs = opts.baseFrameMs ?? 16.667;
  const jitterMs = opts.jitterMs ?? 0.5;
  const pollEverySlides = opts.pollEverySlides ?? 5;

  let frameIndex = 0;
  let slideIndex = 0;
  let polls = 0;
  let pollFlag = false;
  let running = true;

  return {
    async nextFrame(): Promise<FrameTickLike> {
      if (!running) throw new Error('syntheticPresenterSource: stopped');
      const startMs = Date.now();
      // Compute duration for this frame (base + uniform jitter).
      const jitter = (Math.random() * 2 - 1) * jitterMs;
      const durationMs = Math.max(1, baseFrameMs + jitter);
      // "Wait" for the duration — but compressed when timeScale > 1.
      // The harness wall-clock loop already handles timeScale; we
      // just need to emit the tick.
      const endMs = startMs + durationMs;
      const tick: Tick = {
        frameIndex,
        startMs,
        endMs,
        durationMs,
        slideIndex,
        isPoll: pollFlag,
      };
      frameIndex++;
      pollFlag = false;
      // After emitting `framesPerSlide` frames, advance to next slide.
      if (frameIndex % framesPerSlide === 0) {
        // Mark next slide's first frame as a poll if it falls on poll cadence.
        if ((slideIndex + 1) % pollEverySlides === 0) {
          polls++;
          pollFlag = true;
        }
        slideIndex = Math.min(slideCount, slideIndex + 1);
      }
      return tick;
    },
    stop(): void {
      running = false;
    },
    nextSlide(): number {
      return slideIndex;
    },
    pollCount(): number {
      return polls;
    },
    lastFrameWasPoll(): boolean {
      return pollFlag;
    },
  };
}

/**
 * Helper: get the synthetic source's start wall-clock so test
 * code can sync its expectations.
 */
export function presenterSourceStartedAt(source: SyntheticPresenterSource): number {
  // The source doesn't expose startWall; we re-create it via
  // nextSlide() and the cumulative frame math. Simpler: assume the
  // source was started "recently" relative to the test. For testing
  // purposes, callers should rely on the harness's start time.
  void source;
  return Date.now() - 1;
}
