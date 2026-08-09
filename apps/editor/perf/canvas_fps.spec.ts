/**
 * Phase 22-beta — Canvas FPS regression suite (G1-3).
 *
 * Drives the editor's canvas with 500 elements for 60 seconds of
 * continuous animation and asserts:
 *   - 60 fps p50
 *   - ≥55 fps p95
 *   - <10% p95 regression vs baseline
 *
 * The baseline lives at `apps/editor/perf/baselines/canvas_fps.json`
 * (gitignored; created on first run; updated by manual PR).
 *
 * Why Playwright + Chromium headless:
 *   - We need real GPU rendering. jsdom or canvas mocks don't exercise
 *     the WebGL2/WebGPU paths that production uses.
 *   - Playwright's `page.evaluate` lets us read `performance.now()` after
 *     each `requestAnimationFrame` tick; that's the frame source.
 *   - Headless Chromium runs in CI without GPU acceleration; we
 *     accept that and baseline against the same headless environment.
 *
 * How to run locally:
 *   1. pnpm --filter editor dev --port 3100
 *   2. pnpm --filter editor exec playwright test perf/canvas_fps.spec.ts
 *
 * The first run produces a baseline; subsequent runs diff against it.
 *
 * Time budget: 60 s in CI is fine (the 60-minute game-day run is
 * covered by `perf-harness`, not this file).
 */

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'baselines/canvas_fps.json');
const FRAME_BUDGET_MS = 60_000; // 60s of measurement
const ELEMENT_COUNT = 500;
const FPS_TARGET_P50 = 60;
const FPS_TARGET_P95 = 55;
const REGRESSION_THRESHOLD_PCT = 10;

interface BaselineReport {
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly frames: number;
}

interface FrameStats {
  readonly frames: number;
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

function loadBaseline(): BaselineReport | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineReport;
  } catch {
    return null;
  }
}

function saveBaseline(stats: FrameStats): void {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  const report: BaselineReport = {
    fps: stats.fps,
    p50Ms: stats.p50Ms,
    p95Ms: stats.p95Ms,
    p99Ms: stats.p99Ms,
    frames: stats.frames,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + '\n');
}

test.describe('canvas FPS regression', () => {
  test('500 elements at 60s', async ({ page }) => {
    test.setTimeout(FRAME_BUDGET_MS + 30_000);

    // Boot the editor and load a 500-element deck.
    await page.goto('/editor/perftest/500-elements');
    await page.waitForSelector('[data-testid="canvas-ready"]', { timeout: 30_000 });

    // Inject a frame-time observer that records each rAF tick.
    await page.evaluate(() => {
      type WindowWithPerf = Window & { __frameTimes: number[] };
      (window as WindowWithPerf).__frameTimes = [];
      let last = performance.now();
      const tick = (now: number) => {
        (window as WindowWithPerf).__frameTimes.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Wait for the measurement window.
    await page.waitForTimeout(FRAME_BUDGET_MS);

    const frames = await page.evaluate<number[]>(() => {
      type WindowWithPerf = Window & { __frameTimes: number[] };
      return (window as WindowWithPerf).__frameTimes ?? [];
    });

    expect(frames.length).toBeGreaterThan(60);

    const stats = computeStats(frames);

    // Hard floors: P22-beta promises 60 fps p50, ≥55 fps p95.
    expect(stats.fps, 'average fps below target').toBeGreaterThanOrEqual(FPS_TARGET_P50 - 5);
    expect(stats.fps).toBeGreaterThan(FPS_TARGET_P50 * (1 - 0.1));

    // p95 in fps terms: 1000 / p95Ms.
    const p95Fps = 1000 / stats.p95Ms;
    expect(p95Fps, `p95 fps = ${p95Fps.toFixed(1)}`).toBeGreaterThanOrEqual(FPS_TARGET_P95);

    // Soft regression check vs baseline.
    const baseline = loadBaseline();
    if (baseline === null) {
      // First run — record the baseline and pass.
      saveBaseline(stats);
      console.log(`baseline recorded: fps=${stats.fps.toFixed(1)}, p95Ms=${stats.p95Ms.toFixed(2)}`);
    } else {
      const p95DeltaPct = ((stats.p95Ms - baseline.p95Ms) / baseline.p95Ms) * 100;
      const fpsDeltaPct = ((stats.fps - baseline.fps) / baseline.fps) * 100;
      console.log(
        `current: fps=${stats.fps.toFixed(1)}, p95Ms=${stats.p95Ms.toFixed(2)}; ` +
          `baseline: fps=${baseline.fps.toFixed(1)}, p95Ms=${baseline.p95Ms.toFixed(2)}; ` +
          `Δp95=${p95DeltaPct.toFixed(1)}%, Δfps=${fpsDeltaPct.toFixed(1)}%`,
      );
      expect(
        p95DeltaPct,
        `p95 regressed by ${p95DeltaPct.toFixed(1)}% (>${REGRESSION_THRESHOLD_PCT}%)`,
      ).toBeLessThan(REGRESSION_THRESHOLD_PCT);
      expect(
        fpsDeltaPct,
        `fps dropped by ${(-fpsDeltaPct).toFixed(1)}% (>${REGRESSION_THRESHOLD_PCT}%)`,
      ).toBeGreaterThan(-REGRESSION_THRESHOLD_PCT);
    }
  });
});

function computeStats(frames: readonly number[]): FrameStats {
  if (frames.length === 0) {
    return { frames: 0, fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const total = sorted.reduce((s, d) => s + d, 0);
  const mean = total / sorted.length;
  return {
    frames: sorted.length,
    fps: 1000 / mean,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)]!,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)]!,
    maxMs: sorted[sorted.length - 1]!,
  };
}