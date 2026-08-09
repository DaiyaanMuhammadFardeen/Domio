/**
 * @domio/perf-harness — replay tests.
 */

import { describe, it, expect } from 'vitest';
import { runReplay } from './replay.js';
import { syntheticFrameSource } from './frame.js';

describe('runReplay', () => {
  it('runs a short scenario to completion', async () => {
    const result = await runReplay({
      scenario: {
        id: 'unit-test',
        durationMs: 100,
        minFps: 30,
      },
      sourceFactory: () => syntheticFrameSource({ targetFrameMs: 16.6 }),
    });
    expect(result.aborted).toBe(false);
    expect(result.frames).toBeGreaterThan(3);
    expect(result.fps).toBeGreaterThan(30);
  });

  it('aborts on jank when minFps is exceeded', async () => {
    const result = await runReplay({
      scenario: {
        id: 'jank-test',
        durationMs: 2000,
        minFps: 1000, // impossible
        jankToleranceMs: 50,
      },
      sourceFactory: () => syntheticFrameSource({ targetFrameMs: 16.6 }),
    });
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toBe('jank');
  });

  it('aborts on memory budget breach', async () => {
    const result = await runReplay({
      scenario: {
        id: 'mem-test',
        durationMs: 5000,
        timeScale: 1, // real time; budget = 1 byte forces breach on first frame
        minFps: 1,
        memoryBudgetBytes: 1, // 1 byte — guaranteed to breach
      },
      sourceFactory: () => syntheticFrameSource({ targetFrameMs: 5 }),
    });
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toBe('memory');
  }, 10_000);

  it('respects external abort signal', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const result = await runReplay({
      scenario: {
        id: 'signal-test',
        durationMs: 60000, // long
        minFps: 0,
      },
      sourceFactory: () => syntheticFrameSource({ targetFrameMs: 5 }),
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toBe('signal');
    expect(result.actualDurationMs).toBeLessThan(5000);
  });

  it('honours timeScale', async () => {
    const t0 = Date.now();
    const result = await runReplay({
      scenario: {
        id: 'time-scale-test',
        durationMs: 10000, // 10s real
        timeScale: 100,    // → 100ms wall
      },
      sourceFactory: () => syntheticFrameSource({ targetFrameMs: 5 }),
    });
    const elapsed = Date.now() - t0;
    // Wall time should be ~100ms (allowing for the very first tick
    // which has no target alignment).
    expect(elapsed).toBeLessThan(5000);
    expect(result.actualDurationMs).toBeLessThan(5000);
  });
});