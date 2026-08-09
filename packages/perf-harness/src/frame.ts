/**
 * @domio/perf-harness — frame-time measurement primitives.
 *
 * The harness is browser-agnostic: it operates on a `FrameSource` that
 * emits "frame done" timestamps. In a real run, that source is a
 * `requestAnimationFrame` loop driving the canvas renderer; in tests,
 * it's a synthetic source (e.g. busy-wait).
 *
 * Why a thin abstraction:
 *   - The harness is reused by the canvas FPS suite (G1-3), the CRDT
 *     bench (G1-4), and the presenter stability suite (G1-5). They
 *     share the same percentiles + regression-detection code.
 *   - We want a deterministic test surface: the unit tests use a
 *     synthetic source to avoid CI flakiness on the perf numbers.
 */

/** A source of frame timestamps. Each call to `nextFrame()` resolves
 * when one frame is "done" (rendered, or simulated). */
export interface FrameSource {
  /** Resolves when the next frame is done. */
  nextFrame(): Promise<FrameTick>;
  /** Stop emitting frames (release timers). */
  stop(): void;
}

/** One frame tick: when it started, when it ended. */
export interface FrameTick {
  readonly frameIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

/** Configuration for a frame-time measurement run. */
export interface FrameMeasurementOptions {
  /** Total frames to capture. */
  readonly frameCount: number;
  /** Source of frame timestamps. */
  readonly source: FrameSource;
  /** Optional abort signal; if aborted, the run ends early and the
   *  result is marked `aborted: true`. */
  readonly signal?: AbortSignal;
}

/** Aggregate frame-time statistics. */
export interface FrameStats {
  readonly frames: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly minMs: number;
  /** Coefficient of variation (stddev / mean). 0 = perfectly stable;
   *  > 0.5 = visible jank. */
  readonly jitter: number;
  /** True if the run was aborted before `frameCount` frames were captured. */
  readonly aborted: boolean;
}

/** Measure frame times from a source. */
export async function measureFrames(
  opts: FrameMeasurementOptions,
): Promise<FrameStats> {
  const durations: number[] = [];
  let aborted = false;

  for (let i = 0; i < opts.frameCount; i++) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    const tick = await opts.source.nextFrame();
    durations.push(tick.durationMs);
  }

  opts.source.stop();

  if (durations.length === 0) {
    return {
      frames: 0,
      durationMs: 0,
      fps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      minMs: 0,
      jitter: 0,
      aborted,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const totalMs = durations.reduce((s, d) => s + d, 0);
  const mean = totalMs / durations.length;
  const variance =
    durations.reduce((s, d) => s + (d - mean) ** 2, 0) / durations.length;
  const stddev = Math.sqrt(variance);

  return {
    frames: durations.length,
    durationMs: totalMs,
    fps: mean > 0 ? 1000 / mean : 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1]!,
    minMs: sorted[0]!,
    jitter: mean > 0 ? stddev / mean : 0,
    aborted,
  };
}

/** Compute the p-th percentile of a sorted array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx]!;
}

/** Regression detector: compare a current measurement to a baseline. */
export interface RegressionVerdict {
  readonly regressed: boolean;
  readonly metric: 'p50Ms' | 'p95Ms' | 'p99Ms' | 'fps';
  readonly baseline: number;
  readonly current: number;
  readonly deltaPct: number;
}

export interface RegressionThresholds {
  /** Allowed p95 regression vs baseline, as a fraction. Default 0.10 (10%). */
  readonly p95MaxRegression?: number;
  /** Allowed p99 regression vs baseline, as a fraction. Default 0.20. */
  readonly p99MaxRegression?: number;
  /** Allowed fps regression (drop) vs baseline, as a fraction. Default 0.10. */
  readonly fpsMaxDrop?: number;
}

/** Detect a regression of `current` vs `baseline`. */
export function detectRegression(
  baseline: FrameStats,
  current: FrameStats,
  thresholds: RegressionThresholds = {},
): readonly RegressionVerdict[] {
  const verdicts: RegressionVerdict[] = [];
  const p95Max = thresholds.p95MaxRegression ?? 0.10;
  const p99Max = thresholds.p99MaxRegression ?? 0.20;
  const fpsMax = thresholds.fpsMaxDrop ?? 0.10;

  if (baseline.p95Ms > 0) {
    const delta = (current.p95Ms - baseline.p95Ms) / baseline.p95Ms;
    verdicts.push({
      regressed: delta > p95Max,
      metric: 'p95Ms',
      baseline: baseline.p95Ms,
      current: current.p95Ms,
      deltaPct: delta * 100,
    });
  }
  if (baseline.p99Ms > 0) {
    const delta = (current.p99Ms - baseline.p99Ms) / baseline.p99Ms;
    verdicts.push({
      regressed: delta > p99Max,
      metric: 'p99Ms',
      baseline: baseline.p99Ms,
      current: current.p99Ms,
      deltaPct: delta * 100,
    });
  }
  if (baseline.fps > 0) {
    const delta = (baseline.fps - current.fps) / baseline.fps;
    verdicts.push({
      regressed: delta > fpsMax,
      metric: 'fps',
      baseline: baseline.fps,
      current: current.fps,
      deltaPct: -delta * 100, // negative because fps dropped
    });
  }
  return verdicts;
}

/** Synthetic frame source for tests: emits frames at a configurable rate. */
export function syntheticFrameSource(opts: {
  readonly targetFrameMs: number;
  readonly startFrameIndex?: number;
}): FrameSource {
  const start = Date.now();
  let i = opts.startFrameIndex ?? 0;
  let stopped = false;
  return {
    nextFrame() {
      if (stopped) {
        return Promise.reject(new Error('frame source stopped'));
      }
      return new Promise<FrameTick>((resolve) => {
        const frameStart = Date.now();
        const elapsed = frameStart - start;
        const target = (i + 1) * opts.targetFrameMs;
        const wait = Math.max(0, target - elapsed);
        setTimeout(() => {
          const frameEnd = Date.now();
          resolve({
            frameIndex: i++,
            startMs: frameStart,
            endMs: frameEnd,
            durationMs: frameEnd - frameStart,
          });
        }, wait);
      });
    },
    stop() {
      stopped = true;
    },
  };
}
