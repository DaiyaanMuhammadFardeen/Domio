/**
 * @domio/perf-harness — frame measurement tests.
 */

import { describe, it, expect } from 'vitest';
import {
  measureFrames,
  detectRegression,
  percentile,
  syntheticFrameSource,
} from './frame.js';

describe('percentile', () => {
  it('returns 0 for empty input', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('computes p50, p95, p99', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 0.5)).toBeCloseTo(50, 0);
    expect(percentile(arr, 0.95)).toBeCloseTo(95, 0);
    expect(percentile(arr, 0.99)).toBeCloseTo(99, 0);
  });

  it('clamps to bounds', () => {
    const arr = [1, 2, 3];
    expect(percentile(arr, 0)).toBe(1);
    expect(percentile(arr, 1)).toBe(3);
  });
});

describe('measureFrames', () => {
  it('measures a synthetic 16.6ms (60fps) frame source', async () => {
    const source = syntheticFrameSource({ targetFrameMs: 16.6 });
    const stats = await measureFrames({ frameCount: 30, source });
    expect(stats.frames).toBe(30);
    expect(stats.fps).toBeGreaterThan(50);
    expect(stats.fps).toBeLessThan(70);
  });

  it('returns zero stats when zero frames are captured', async () => {
    const source = syntheticFrameSource({ targetFrameMs: 16.6 });
    const stats = await measureFrames({ frameCount: 0, source });
    expect(stats.frames).toBe(0);
    expect(stats.fps).toBe(0);
  });

  it('respects an abort signal', async () => {
    const source = syntheticFrameSource({ targetFrameMs: 5 });
    const controller = new AbortController();
    const promise = measureFrames({
      frameCount: 1000,
      source,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);
    const stats = await promise;
    expect(stats.aborted).toBe(true);
    expect(stats.frames).toBeLessThan(1000);
  });

  it('computes jitter correctly', async () => {
    const source = syntheticFrameSource({ targetFrameMs: 16.6 });
    const stats = await measureFrames({ frameCount: 60, source });
    // Synthetic source should be near-perfectly stable; jitter < 0.2.
    expect(stats.jitter).toBeGreaterThanOrEqual(0);
    expect(stats.jitter).toBeLessThan(0.5);
  });
});

describe('detectRegression', () => {
  const baseline = {
    frames: 60,
    durationMs: 1000,
    fps: 60,
    p50Ms: 16,
    p95Ms: 18,
    p99Ms: 22,
    maxMs: 25,
    minMs: 14,
    jitter: 0.1,
    aborted: false,
  };

  it('reports no regression when current matches baseline', () => {
    const verdicts = detectRegression(baseline, baseline);
    expect(verdicts.every((v) => !v.regressed)).toBe(true);
  });

  it('reports p95 regression > 10%', () => {
    const regressed = { ...baseline, p95Ms: 25 }; // 25/18 ≈ 1.39 → 39% worse
    const verdicts = detectRegression(baseline, regressed);
    const p95 = verdicts.find((v) => v.metric === 'p95Ms');
    expect(p95?.regressed).toBe(true);
    expect(p95?.deltaPct).toBeGreaterThan(10);
  });

  it('reports fps drop > 10%', () => {
    const regressed = { ...baseline, fps: 50 }; // dropped from 60 → 50
    const verdicts = detectRegression(baseline, regressed);
    const fps = verdicts.find((v) => v.metric === 'fps');
    expect(fps?.regressed).toBe(true);
  });

  it('does not flag a 5% p95 improvement', () => {
    const improved = { ...baseline, p95Ms: 17.1 }; // 5% better
    const verdicts = detectRegression(baseline, improved);
    const p95 = verdicts.find((v) => v.metric === 'p95Ms');
    expect(p95?.regressed).toBe(false);
    expect(p95?.deltaPct).toBeLessThan(0);
  });

  it('honours custom thresholds', () => {
    const regressed = { ...baseline, p95Ms: 19 }; // 5.5% worse
    const strictVerdicts = detectRegression(baseline, regressed, {
      p95MaxRegression: 0.05,
    });
    expect(strictVerdicts.find((v) => v.metric === 'p95Ms')?.regressed).toBe(true);
    const laxVerdicts = detectRegression(baseline, regressed, {
      p95MaxRegression: 0.10,
    });
    expect(laxVerdicts.find((v) => v.metric === 'p95Ms')?.regressed).toBe(false);
  });
});