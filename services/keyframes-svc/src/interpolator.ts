/**
 * Phase 11 camera keyframe — local cubic-bezier interpolator.
 *
 * Pure math: cubic bezier solve via Newton-Raphson with monotone-safe
 * bisection fallback, then linear interpolation of each DOF between
 * surrounding keyframes.
 *
 * NOTE: packages/3d-engine/src/camera/KeyframeInterpolator.ts does not
 * exist at time of build — using local fallback as specified.
 * Engine wiring expected at integration; local impl is the default.
 */

import type { BezierEasing, Vec3, CameraKeyframe, CameraPose } from './types.js';
import type { EasingLruCache } from './easing-cache.js';
import { easingKey } from './easing-cache.js';

// ---------------------------------------------------------------------------
// Cubic-bezier math
// ---------------------------------------------------------------------------

/**
 * Solve cubic bezier x(t) = target for t using Newton-Raphson
 * with monotone-safe bisection fallback.
 */
function solveCubicBezierX(x1: number, x2: number, targetX: number): number {
  // x(t) = 3(1-t)^2 * t * x1 + 3(1-t) * t^2 * x2 + t^3
  // Expanded: ax*t^3 + bx*t^2 + cx*t
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const sampleX = (tt: number): number => ((ax * tt + bx) * tt + cx) * tt;
  const sampleDX = (tt: number): number => (3 * ax * tt + 2 * bx) * tt + cx;

  // Newton-Raphson (8 iterations)
  let t = targetX;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - targetX;
    if (Math.abs(err) < 1e-7) break;
    const dx = sampleDX(t);
    if (Math.abs(dx) < 1e-7) break;
    t -= err / dx;
  }
  t = Math.max(0, Math.min(1, t));

  // Verify accuracy; if bad, fall back to bisection
  if (Math.abs(sampleX(t) - targetX) > 1e-4) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      const xMid = sampleX(mid);
      if (Math.abs(xMid - targetX) < 1e-7) {
        t = mid;
        break;
      }
      if (xMid < targetX) lo = mid;
      else hi = mid;
      t = mid;
    }
  }

  return t;
}

/**
 * Evaluate cubic bezier y at normalized time tNorm ∈ [0,1].
 * Uses LRU-cached LUT when available.
 */
function evalCubicBezierY(
  easing: BezierEasing,
  tNorm: number,
  cache: EasingLruCache | undefined,
  nSamples: number = 256,
): number {
  const { p1x, p1y, p2x, p2y } = easing;

  // Linear degenerate cases
  if (p1x === 0 && p2x === 0) return tNorm;
  if (p1x === 1 && p2x === 1) return tNorm;

  // Try cache first
  if (cache !== undefined) {
    const key = easingKey(easing, nSamples);
    let lut = cache.get(key);
    if (lut === undefined) {
      lut = buildEasingLut(easing, nSamples);
      cache.set(key, lut);
    }
    // Interpolate within LUT
    const idx = tNorm * (nSamples - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, nSamples - 1);
    const frac = idx - lo;
    return (1 - frac) * lut[lo]! + frac * lut[hi]!;
  }

  // No cache: direct evaluation via Newton-Raphson
  const paramT = solveCubicBezierX(p1x, p2x, tNorm);

  // Evaluate y(t) = 3(1-t)^2 * t * y1 + 3(1-t) * t^2 * y2 + t^3
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const yVal = ((ay * paramT + by) * paramT + cy) * paramT;
  return Math.max(-0.25, Math.min(1.25, yVal));
}

/**
 * Build a LUT for an easing curve.
 */
function buildEasingLut(easing: BezierEasing, size: number): Float64Array {
  const lut = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const paramT = solveCubicBezierX(easing.p1x, easing.p2x, t);
    const cy = 3 * easing.p1y;
    const by = 3 * (easing.p2y - easing.p1y) - cy;
    const ay = 1 - cy - by;
    let v = ((ay * paramT + by) * paramT + cy) * paramT;
    if (v < -0.25) v = -0.25;
    if (v > 1.25) v = 1.25;
    lut[i] = v;
  }
  return lut;
}

// ---------------------------------------------------------------------------
// Vec3 interpolation
// ---------------------------------------------------------------------------

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// ---------------------------------------------------------------------------
// Public interpolation API
// ---------------------------------------------------------------------------

/**
 * Interpolate camera pose at a given time across sorted keyframes.
 *
 * @param sortedKeyframes - keyframes sorted by orderIndex
 * @param timeMs          - time at which to evaluate
 * @param cache           - optional easing LUT cache
 */
export function interpolatePose(
  sortedKeyframes: readonly CameraKeyframe[],
  timeMs: number,
  cache?: EasingLruCache,
): CameraPose {
  if (sortedKeyframes.length === 0) {
    return {
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 50,
      roll: 0,
    };
  }

  if (sortedKeyframes.length === 1) {
    const kf = sortedKeyframes[0]!;
    return {
      position: kf.position,
      target: kf.target,
      fov: kf.fov,
      roll: kf.roll,
    };
  }

  // Compute cumulative times (each keyframe's duration defines the segment
  // FROM it TO the next keyframe)
  let cumulative = 0;
  const segments: Array<{
    start: number;
    end: number;
    prevKf: CameraKeyframe;
    currKf: CameraKeyframe;
  }> = [];

  for (let i = 0; i < sortedKeyframes.length - 1; i++) {
    const prev = sortedKeyframes[i]!;
    const curr = sortedKeyframes[i + 1]!;
    segments.push({
      start: cumulative,
      end: cumulative + prev.durationMs,
      prevKf: prev,
      currKf: curr,
    });
    cumulative += prev.durationMs;
  }

  const totalDuration = cumulative;
  if (totalDuration <= 0) {
    // All durations zero — return first keyframe pose
    const kf = sortedKeyframes[0]!;
    return { position: kf.position, target: kf.target, fov: kf.fov, roll: kf.roll };
  }

  const clampedTime = Math.max(0, Math.min(timeMs, totalDuration));

  // Find the segment containing clampedTime
  let seg = segments[0]!;
  for (const s of segments) {
    if (clampedTime >= s.start && clampedTime <= s.end) {
      seg = s;
      break;
    }
    if (clampedTime > s.end) {
      seg = s;
    }
  }

  const segDuration = seg.end - seg.start;
  if (segDuration <= 0) {
    return {
      position: seg.currKf.position,
      target: seg.currKf.target,
      fov: seg.currKf.fov,
      roll: seg.currKf.roll,
    };
  }

  const rawT = (clampedTime - seg.start) / segDuration;
  const easedT = evalCubicBezierY(seg.prevKf.easing, rawT, cache);

  return {
    position: lerpVec3(seg.prevKf.position, seg.currKf.position, easedT),
    target: lerpVec3(seg.prevKf.target, seg.currKf.target, easedT),
    fov: seg.prevKf.fov + (seg.currKf.fov - seg.prevKf.fov) * easedT,
    roll: seg.prevKf.roll + (seg.currKf.roll - seg.prevKf.roll) * easedT,
  };
}

/**
 * Check if crossfade is needed (first and last keyframe differ in slide context).
 */
export function checkCrossfade(keyframes: readonly CameraKeyframe[]): boolean {
  if (keyframes.length < 2) return false;
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  return first.slideId !== last.slideId;
}
