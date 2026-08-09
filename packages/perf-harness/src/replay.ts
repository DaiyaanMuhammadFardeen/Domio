/**
 * @domio/perf-harness — replay harness.
 *
 * Replays a canonical scenario (e.g., "500-element deck at 60 fps for
 * 60 minutes") against a frame source. The replay harness itself is
 * scenario-agnostic: it takes a `ReplayScenario` and drives it.
 *
 * Scenarios for P22-beta:
 *   - `canvas-fps-500-elems-60m` (G1-3)
 *   - `crdt-convergence-1k-editors` (G1-4)
 *   - `presenter-2h-stability` (G1-5)
 *
 * The harness is responsible for:
 *   - Time-scaling (a 60-minute scenario can be replayed at 10× for
 *     CI; the scenario itself defines the scale).
 *   - Frame budget enforcement (a scenario can require ≥60 fps; the
 *     harness aborts if it drops below for >5 seconds continuously).
 *   - Memory sampling (RSS delta) at fixed intervals.
 */

export interface ReplayScenario {
  /** Stable id; used as the report filename. */
  readonly id: string;
  /** Total duration of the scenario in the *real* time domain (ms). */
  readonly durationMs: number;
  /** Time-scale factor; 1 = real time, 10 = 10× speed (CI-friendly). */
  readonly timeScale?: number;
  /** Frame budget. Frames below this for `jankToleranceMs` continuously
   *  trigger an abort. */
  readonly minFps?: number;
  /** Jank tolerance: how long the scenario can run below `minFps`
   *  before aborting. Default 5000 ms. */
  readonly jankToleranceMs?: number;
  /** Memory budget in bytes; if RSS grows by more than this from the
   *  start of the scenario, abort. */
  readonly memoryBudgetBytes?: number;
}

/** Result of a replay run. */
export interface ReplayResult {
  readonly scenario: ReplayScenario;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly actualDurationMs: number;
  readonly frames: number;
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly memoryGrowthBytes: number;
  readonly aborted: boolean;
  readonly abortReason?: 'jank' | 'memory' | 'signal';
}

/** Options passed to a replay run. */
export interface ReplayRunOptions {
  readonly scenario: ReplayScenario;
  /** Source of frame timestamps (typically a rAF loop in the browser,
   *  or the synthetic source in CI). */
  readonly sourceFactory: () => FrameSourceLike;
  /** Called periodically with the current frame tick; the scenario's
   *  workload goes here. */
  readonly onTick?: (tick: FrameTickLike, elapsedMs: number) => void;
  /** Abort signal for the run. */
  readonly signal?: AbortSignal;
}

export interface FrameTickLike {
  readonly frameIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface FrameSourceLike {
  nextFrame(): Promise<FrameTickLike>;
  stop(): void;
}

/** Run a scenario; abort on jank or memory budget breach. */
export async function runReplay(opts: ReplayRunOptions): Promise<ReplayResult> {
  const scenario = opts.scenario;
  const timeScale = scenario.timeScale ?? 1;
  const scaledDuration = scenario.durationMs / timeScale;
  const jankTolerance = scenario.jankToleranceMs ?? 5000;
  const minFps = scenario.minFps ?? 0;

  const source = opts.sourceFactory();
  const startRss = process.memoryUsage().rss;
  const startWall = Date.now();
  const frames: number[] = [];
  let aborted = false;
  let abortReason: 'jank' | 'memory' | 'signal' | undefined;
  let firstFrameStart = 0;
  let lowFpsAccumMs = 0;

  while (Date.now() - startWall < scaledDuration) {
    if (opts.signal?.aborted) {
      aborted = true;
      abortReason = 'signal';
      break;
    }
    const tick = await source.nextFrame();
    if (firstFrameStart === 0) firstFrameStart = tick.startMs;
    frames.push(tick.durationMs);
    opts.onTick?.(tick, Date.now() - startWall);

    // Jank check.
    const fps = 1000 / Math.max(0.001, tick.durationMs);
    if (fps < minFps && minFps > 0) {
      lowFpsAccumMs += tick.durationMs;
      if (lowFpsAccumMs > jankTolerance) {
        aborted = true;
        abortReason = 'jank';
        break;
      }
    } else {
      lowFpsAccumMs = 0;
    }

    // Memory check.
    if (scenario.memoryBudgetBytes !== undefined) {
      const rss = process.memoryUsage().rss;
      if (rss - startRss > scenario.memoryBudgetBytes) {
        aborted = true;
        abortReason = 'memory';
        break;
      }
    }
  }
  source.stop();
  const endRss = process.memoryUsage().rss;
  const endWall = Date.now();

  if (frames.length === 0) {
    return {
      scenario,
      startedAtMs: startWall,
      endedAtMs: endWall,
      actualDurationMs: endWall - startWall,
      frames: 0,
      fps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      memoryGrowthBytes: endRss - startRss,
      aborted,
      ...(abortReason ? { abortReason } : {}),
    };
  }

  const sorted = [...frames].sort((a, b) => a - b);
  const totalMs = frames.reduce((s, d) => s + d, 0);
  const mean = totalMs / frames.length;

  return {
    scenario,
    startedAtMs: startWall,
    endedAtMs: endWall,
    actualDurationMs: endWall - startWall,
    frames: frames.length,
    fps: mean > 0 ? 1000 / mean : 0,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)]!,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)]!,
    memoryGrowthBytes: endRss - startRss,
    aborted,
    ...(abortReason ? { abortReason } : {}),
  };
}
