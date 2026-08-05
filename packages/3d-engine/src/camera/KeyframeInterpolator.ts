/**
 * 7-DOF camera keyframe interpolation at 60 Hz.
 *
 * Interpolates position(3) + target(3) + fov(1) between CameraKeyframes
 * using cubic Bezier easing.  Model changes between slides trigger a
 * crossfade fallback.  Same-model transforms use local-frame paths.
 *
 * Includes scroll/click driver math (M5.4):
 * - Normalised [0,1] keyframe timeline mapped from scroll position.
 * - Scroll past last keyframe → halts (or wraps per author choice).
 * - Click advances/wraps per choice.
 * - Driver cost ≤ 1 ms/frame (deterministic step count).
 */

import type { Vec3, CameraKeyframe } from '../contracts/renderer.v1.js';
import {
  cubicBezier,
  EasingLutCache,
} from './EasingLUT.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface InterpolationResult {
  position: Vec3;
  target: Vec3;
  fovDeg: number;
  rollDeg: number;
  /** True when the model changed between slides → crossfade fallback. */
  crossfade: boolean;
  /** True when the path is in local frame (same model, different transforms). */
  inLocalFrame: boolean;
}

export interface ScrollDriverOptions {
  /** Total scroll height in pixels. */
  scrollHeight: number;
  /** Keyframe timeline duration in ms. */
  totalDurationMs: number;
  /** Wrap around when scrolling past the end (default false = halt). */
  wrap?: boolean;
}

export interface ScrollDriverResult {
  /** Current keyframe index. */
  keyframeIndex: number;
  /** Progress within the current keyframe segment [0, 1]. */
  progress: number;
  /** True when halted at the end. */
  halted: boolean;
  /** Estimated cost per frame in microseconds. */
  stepCostUs: number;
}

export interface ClickDriverOptions {
  /** Total number of keyframes. */
  totalKeyframes: number;
  /** Current keyframe index. */
  currentIndex: number;
  /** Wrap around when clicking past the end (default false = halt). */
  wrap?: boolean;
}

export interface ClickDriverResult {
  /** New keyframe index. */
  newIndex: number;
  /** True when halted (wrap=false and at end). */
  halted: boolean;
}

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// LUT cache singleton
// ---------------------------------------------------------------------------

const lutCache = new EasingLutCache();

function getEasingLut(easing: [number, number, number, number]): Float64Array {
  const sig = `cubic:${easing[0]},${easing[1]},${easing[2]},${easing[3]}`;
  return lutCache.get(sig, cubicBezier(...easing));
}

function sampleLut(lut: Float64Array, t: number): number {
  const idx = t * (lut.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, lut.length - 1);
  const frac = idx - lo;
  const a = lut[lo] ?? 0;
  const b = lut[hi] ?? 0;
  return a + (b - a) * frac;
}

// ---------------------------------------------------------------------------
// 7-DOF interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolate between two camera keyframes at 60 Hz.
 *
 * @param from - Start keyframe
 * @param to - End keyframe
 * @param t - Normalised time [0, 1]
 * @param modelChanged - True when the model changed between slides
 * @param sameModelTransformed - True when same model with different transforms
 * @returns Interpolated camera pose
 */
export function interpolateKeyframes(
  from: CameraKeyframe,
  to: CameraKeyframe,
  t: number,
  modelChanged: boolean,
  sameModelTransformed: boolean,
): InterpolationResult {
  if (modelChanged) {
    // Crossfade fallback
    return {
      position: lerpVec3(from.position, to.position, t),
      target: lerpVec3(from.target, to.target, t),
      fovDeg: lerp(from.fovDeg, to.fovDeg, t),
      rollDeg: lerp(from.rollDeg, to.rollDeg, t),
      crossfade: true,
      inLocalFrame: false,
    };
  }

  // Use LUT-cached easing
  const lut = getEasingLut(from.easing);
  const eased = sampleLut(lut, t);

  return {
    position: lerpVec3(from.position, to.position, eased),
    target: lerpVec3(from.target, to.target, eased),
    fovDeg: lerp(from.fovDeg, to.fovDeg, eased),
    rollDeg: lerp(from.rollDeg, to.rollDeg, eased),
    crossfade: false,
    inLocalFrame: sameModelTransformed,
  };
}

/**
 * Generate 60 Hz sample points between two keyframes.
 */
export function sampleAt60Hz(
  from: CameraKeyframe,
  to: CameraKeyframe,
  modelChanged: boolean,
  sameModelTransformed: boolean,
): InterpolationResult[] {
  const fps = 60;
  const durationSec = from.durationMs / 1000;
  const totalFrames = Math.round(durationSec * fps);
  const results: InterpolationResult[] = [];

  for (let i = 0; i <= totalFrames; i++) {
    const t = i / Math.max(totalFrames, 1);
    results.push(
      interpolateKeyframes(from, to, t, modelChanged, sameModelTransformed),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scroll driver (M5.4)
// ---------------------------------------------------------------------------

/**
 * Map scroll position to keyframe index + progress.
 *
 * Cost model: deterministic step count ≤ 1 ms/frame.
 */
export function scrollToKeyframe(
  scrollY: number,
  keyframes: CameraKeyframe[],
  options: ScrollDriverOptions,
): ScrollDriverResult {
  const startTime = performance.now();

  if (keyframes.length === 0) {
    return { keyframeIndex: 0, progress: 0, halted: true, stepCostUs: 0 };
  }

  const normalizedScroll = Math.max(0, Math.min(1, scrollY / options.scrollHeight));
  const totalMs = options.totalDurationMs;
  const currentTimeMs = normalizedScroll * totalMs;

  // Find which keyframe segment we're in
  let accumulatedMs = 0;
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!;
    const kfDuration = kf.durationMs;
    if (currentTimeMs <= accumulatedMs + kfDuration || i === keyframes.length - 1) {
      const segProgress = Math.min(1, (currentTimeMs - accumulatedMs) / kfDuration);
      const elapsed = performance.now() - startTime;

      if (i === keyframes.length - 1 && !options.wrap && segProgress >= 1) {
        return {
          keyframeIndex: i,
          progress: 1,
          halted: true,
          stepCostUs: elapsed * 1000,
        };
      }

      return {
        keyframeIndex: i,
        progress: Math.max(0, Math.min(1, segProgress)),
        halted: false,
        stepCostUs: elapsed * 1000,
      };
    }
    accumulatedMs += kfDuration;
  }

  return { keyframeIndex: 0, progress: 0, halted: true, stepCostUs: 0 };
}

// ---------------------------------------------------------------------------
// Click driver (M5.4)
// ---------------------------------------------------------------------------

/**
 * Advance to the next keyframe on click.
 */
export function clickAdvance(options: ClickDriverOptions): ClickDriverResult {
  const next = options.currentIndex + 1;
  if (next >= options.totalKeyframes) {
    if (options.wrap) {
      return { newIndex: 0, halted: false };
    }
    return { newIndex: options.currentIndex, halted: true };
  }
  return { newIndex: next, halted: false };
}
