/**
 * @domio/animation-runtime — perf smoke (R-09-3): 64 tracks at 60 fps.
 *
 * Deterministic correctness check at scale + generous wall-clock budget so the
 * gate is meaningful in CI without being flaky: 64 tracks across 8 timelines,
 * each with 120 keyframes, stepped at 60 fps for 600 frames (10 s of
 * animation). The budget asserts an average well under the 16.67 ms frame
 * window with 3x headroom.
 */

import { describe, it, expect } from 'vitest';
import { TimelineEngine } from './TimelineEngine.js';
import type { Timeline, Track } from './types.js';

function makeTrack(seed: number): Track {
  const keyframes: Track['keyframes'] = [];
  for (let i = 0; i <= 120; i++) {
    keyframes.push({ timeMs: i * 50, value: (i * seed) % 100 });
  }
  return {
    id: `track-${seed}`,
    property: 'opacity',
    keyframes,
    startOffsetMs: 0,
  };
}

function makeTimeline(id: string, seed: number): Timeline {
  const tracks: Track[] = [];
  for (let t = 0; t < 8; t++) {
    tracks.push(makeTrack(seed * 8 + t));
  }
  return {
    id,
    elementId: `el-${seed}`,
    durationMs: 6000,
    loop: true,
    playCount: 1,
    startOffsetMs: 0,
    tracks,
    triggers: [],
  };
}

describe('perf smoke — 64 tracks @ 60fps (R-09-3)', () => {
  it('interpolates 64 tracks across 600 frames within the frame budget', () => {
    const engine = new TimelineEngine();
    for (let i = 0; i < 8; i++) {
      engine.addTimeline(makeTimeline(`tl-${i}`, i));
    }

    let frames = 0;
    let resultsSeen = 0;
    engine.subscribe((results) => {
      frames += 1;
      resultsSeen += results.length;
    });

    engine.play();

    const t0 = performance.now();
    const FRAMES = 600;
    for (let f = 0; f < FRAMES; f++) {
      engine.tickManually(16.67);
    }
    const elapsedMs = performance.now() - t0;

    // Every frame must produce interpolated results for all 64 tracks.
    expect(frames).toBe(FRAMES);
    expect(resultsSeen).toBe(FRAMES * 64);

    // Budget: 600 frames under 2000 ms total => ~3.3 ms/frame avg,
    // comfortably inside the 16.67 ms frame window (3x headroom).
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('holds the budget with a fully subscribed listener set', () => {
    const engine = new TimelineEngine();
    for (let i = 0; i < 8; i++) {
      engine.addTimeline(makeTimeline(`tl-${i}`, i));
    }
    const listeners = Array.from({ length: 20 }, () => engine.subscribe(() => {}));

    engine.play();
    const t0 = performance.now();
    for (let f = 0; f < 300; f++) {
      engine.tickManually(16.67);
    }
    const elapsedMs = performance.now() - t0;
    expect(elapsedMs).toBeLessThan(1500);

    listeners.forEach((unsub) => unsub());
  });
});
