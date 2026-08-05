import { describe, it, expect } from 'vitest';
import {
  interpolateKeyframes,
  sampleAt60Hz,
  scrollToKeyframe,
  clickAdvance,
} from './KeyframeInterpolator.js';
import type { CameraKeyframe } from '../contracts/renderer.v1.js';

function makeKeyframe(overrides: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    fovDeg: 45,
    rollDeg: 0,
    timeMs: 0,
    easing: [0.42, 0, 0.58, 1],
    durationMs: 900,
    trigger: 'auto',
    ...overrides,
  };
}

describe('7-DOF interpolation', () => {
  it('interpolates position at t=0 returns start', () => {
    const from = makeKeyframe({ position: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const result = interpolateKeyframes(from, to, 0, false, false);
    expect(result.position.x).toBeCloseTo(0, 4);
  });

  it('interpolates position at t=1 returns end', () => {
    const from = makeKeyframe({ position: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const result = interpolateKeyframes(from, to, 1, false, false);
    expect(result.position.x).toBeCloseTo(10, 4);
  });

  it('interpolates target', () => {
    const from = makeKeyframe({ target: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ target: { x: 5, y: 5, z: 5 } });
    const result = interpolateKeyframes(from, to, 0.5, false, false);
    expect(result.target.x).toBeCloseTo(2.5, 1);
  });

  it('interpolates fovDeg', () => {
    const from = makeKeyframe({ fovDeg: 30 });
    const to = makeKeyframe({ fovDeg: 90 });
    const result = interpolateKeyframes(from, to, 0.5, false, false);
    expect(result.fovDeg).toBeCloseTo(60, 0);
  });

  it('interpolates rollDeg', () => {
    const from = makeKeyframe({ rollDeg: 0 });
    const to = makeKeyframe({ rollDeg: 45 });
    const result = interpolateKeyframes(from, to, 0.5, false, false);
    expect(result.rollDeg).toBeCloseTo(22.5, 0);
  });

  it('default easing is used', () => {
    const from = makeKeyframe({ easing: [0.42, 0, 0.58, 1] });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const result = interpolateKeyframes(from, to, 0.5, false, false);
    // Ease-in-out at 0.5 should be close to 0.5
    expect(result.position.x).toBeCloseTo(5, 1);
  });
});

describe('crossfade fallback', () => {
  it('sets crossfade flag when model changed', () => {
    const from = makeKeyframe();
    const to = makeKeyframe();
    const result = interpolateKeyframes(from, to, 0.5, true, false);
    expect(result.crossfade).toBe(true);
  });

  it('crossfade still interpolates linearly', () => {
    const from = makeKeyframe({ position: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const result = interpolateKeyframes(from, to, 0.5, true, false);
    expect(result.position.x).toBeCloseTo(5, 4);
  });

  it('no crossfade when model is the same', () => {
    const from = makeKeyframe();
    const to = makeKeyframe();
    const result = interpolateKeyframes(from, to, 0.5, false, false);
    expect(result.crossfade).toBe(false);
  });
});

describe('local-frame path', () => {
  it('sets inLocalFrame when same model transformed', () => {
    const from = makeKeyframe();
    const to = makeKeyframe();
    const result = interpolateKeyframes(from, to, 0.5, false, true);
    expect(result.inLocalFrame).toBe(true);
  });

  it('inLocalFrame is false when model changed', () => {
    const from = makeKeyframe();
    const to = makeKeyframe();
    const result = interpolateKeyframes(from, to, 0.5, true, true);
    expect(result.crossfade).toBe(true);
    expect(result.inLocalFrame).toBe(false);
  });
});

describe('sampleAt60Hz', () => {
  it('generates correct number of samples', () => {
    const from = makeKeyframe({ durationMs: 600 });
    const to = makeKeyframe();
    const samples = sampleAt60Hz(from, to, false, false);
    // 600ms * 60fps / 1000 = 36 frames + start = 37
    expect(samples).toHaveLength(37);
  });

  it('first sample is at start', () => {
    const from = makeKeyframe({ position: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const samples = sampleAt60Hz(from, to, false, false);
    expect(samples[0]!.position.x).toBeCloseTo(0, 4);
  });

  it('last sample is at end', () => {
    const from = makeKeyframe({ position: { x: 0, y: 0, z: 0 } });
    const to = makeKeyframe({ position: { x: 10, y: 0, z: 0 } });
    const samples = sampleAt60Hz(from, to, false, false);
    const last = samples[samples.length - 1]!;
    expect(last.position.x).toBeCloseTo(10, 2);
  });
});

describe('scroll driver', () => {
  const keyframes = [
    makeKeyframe({ durationMs: 500 }),
    makeKeyframe({ durationMs: 500 }),
    makeKeyframe({ durationMs: 500 }),
  ];
  const options = {
    scrollHeight: 1000,
    totalDurationMs: 1500,
  };

  it('maps scroll position to keyframe index + progress', () => {
    const result = scrollToKeyframe(500, keyframes, options);
    // scroll=500, scrollHeight=1000 → normalized=0.5 → currentTimeMs=750
    // Keyframes: [0-500ms, 500-1000ms, 1000-1500ms]
    // 750ms falls in keyframe 1 (500-1000), progress = (750-500)/500 = 0.5
    expect(result.keyframeIndex).toBe(1);
    expect(result.progress).toBeCloseTo(0.5, 1);
  });

  it('scroll to end halts', () => {
    const result = scrollToKeyframe(1000, keyframes, options);
    expect(result.halted).toBe(true);
  });

  it('scroll past end halts when wrap=false', () => {
    const result = scrollToKeyframe(2000, keyframes, options);
    expect(result.halted).toBe(true);
  });

  it('wrap allows scrolling past end', () => {
    const result = scrollToKeyframe(2000, keyframes, { ...options, wrap: true });
    expect(result.halted).toBe(false);
  });

  it('reports step cost in microseconds', () => {
    const result = scrollToKeyframe(500, keyframes, options);
    expect(result.stepCostUs).toBeGreaterThanOrEqual(0);
    expect(result.stepCostUs).toBeLessThan(1000); // well under 1ms
  });
});

describe('click driver', () => {
  it('advances to next keyframe', () => {
    const result = clickAdvance({
      totalKeyframes: 5,
      currentIndex: 2,
    });
    expect(result.newIndex).toBe(3);
    expect(result.halted).toBe(false);
  });

  it('halts at end when wrap=false', () => {
    const result = clickAdvance({
      totalKeyframes: 5,
      currentIndex: 4,
    });
    expect(result.newIndex).toBe(4);
    expect(result.halted).toBe(true);
  });

  it('wraps to start when wrap=true', () => {
    const result = clickAdvance({
      totalKeyframes: 5,
      currentIndex: 4,
      wrap: true,
    });
    expect(result.newIndex).toBe(0);
    expect(result.halted).toBe(false);
  });

  it('click on first keyframe advances to second', () => {
    const result = clickAdvance({
      totalKeyframes: 3,
      currentIndex: 0,
    });
    expect(result.newIndex).toBe(1);
  });
});
