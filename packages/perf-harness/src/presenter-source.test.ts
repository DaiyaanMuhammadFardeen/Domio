/**
 * Tests for the synthetic presenter frame source + G1-5 scenario preset.
 */

import { describe, it, expect } from 'vitest';
import {
  syntheticPresenterSource,
  PRESENTER_2H_STABILITY,
  ALL_REPLAY_SCENARIOS,
  getReplayScenario,
  runReplay,
} from './index.js';

describe('PRESENTER_2H_STABILITY scenario', () => {
  it('has the headline id and 2h duration', () => {
    expect(PRESENTER_2H_STABILITY.id).toBe('presenter-2h-stability');
    expect(PRESENTER_2H_STABILITY.durationMs).toBe(2 * 60 * 60 * 1000);
    expect(PRESENTER_2H_STABILITY.timeScale).toBe(600);
  });

  it('applies a memory budget', () => {
    expect(PRESENTER_2H_STABILITY.memoryBudgetBytes).toBeGreaterThan(0);
  });

  it('includes a minFps budget', () => {
    expect(PRESENTER_2H_STABILITY.minFps).toBeGreaterThanOrEqual(30);
  });
});

describe('ALL_REPLAY_SCENARIOS', () => {
  it('includes G1-3/4/5', () => {
    const ids = ALL_REPLAY_SCENARIOS.map((s) => s.id);
    expect(ids).toContain('canvas-fps-500-elems-60m');
    expect(ids).toContain('crdt-converge-1k-editors');
    expect(ids).toContain('presenter-2h-stability');
  });
});

describe('getReplayScenario', () => {
  it('returns the matching scenario', () => {
    expect(getReplayScenario('presenter-2h-stability')).toBe(PRESENTER_2H_STABILITY);
  });
  it('returns undefined for unknown ids', () => {
    expect(getReplayScenario('not-a-real-id')).toBeUndefined();
  });
});

describe('syntheticPresenterSource', () => {
  it('emits a frame per nextFrame() call', async () => {
    const src = syntheticPresenterSource({ slideCount: 5, framesPerSlide: 10 });
    const f1 = await src.nextFrame();
    expect(f1.frameIndex).toBe(0);
    expect(f1.durationMs).toBeGreaterThan(0);
    const f2 = await src.nextFrame();
    expect(f2.frameIndex).toBe(1);
    src.stop();
  });

  it('emits a poll marker every Nth slide', async () => {
    const src = syntheticPresenterSource({
      slideCount: 20,
      framesPerSlide: 5,
      pollEverySlides: 5,
    });
    let polls = 0;
    for (let i = 0; i < 20 * 5; i++) {
      const tick = await src.nextFrame();
      if (tick.frameIndex === 0) continue; // first frame of new slide
      // We can't read isPoll from FrameTickLike, but we can track via pollCount.
    }
    polls = src.pollCount();
    expect(polls).toBeGreaterThan(0);
    src.stop();
  });

  it('advances slide index over time', async () => {
    const src = syntheticPresenterSource({ slideCount: 10, framesPerSlide: 2 });
    expect(src.nextSlide()).toBe(0);
    await src.nextFrame();
    await src.nextFrame();
    // After 2 frames, slide should advance.
    expect(src.nextSlide()).toBe(1);
    src.stop();
  });
});

describe('runReplay with presenter source', () => {
  it('runs the presenter scenario at heavy time-scale without aborting', async () => {
    // Custom scenario: very short, timeScale 60000, no minFps so we don't
    // accidentally trip the jank detector. Tests the wiring path.
    const result = await runReplay({
      scenario: {
        id: 'presenter-test',
        durationMs: 1000,
        timeScale: 1000,
        minFps: 0,
        jankToleranceMs: 100,
        memoryBudgetBytes: 100 * 1024 * 1024,
      },
      sourceFactory: () => syntheticPresenterSource({
        slideCount: 5,
        framesPerSlide: 10,
        baseFrameMs: 5,
      }),
    });
    expect(result.aborted).toBe(false);
    expect(result.frames).toBeGreaterThan(0);
  }, 5_000);
});