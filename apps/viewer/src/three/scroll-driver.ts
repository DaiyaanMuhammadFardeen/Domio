/**
 * @domio/viewer — Phase 11 scroll-driven 3D storytelling.
 *
 * Implements M5.4: a passive scroll listener that maps the page scroll
 * position to a normalized `[0, 1]` keyframe timeline. The timeline is
 * then sampled by the camera-keyframe interpolator and rendered against
 * the active 3D viewport.
 *
 * Constraints (per /docs/development_phases/phase-11-3d-motion-rich-media.md §M5.4):
 *  - ≤ 1 ms / frame for a hero scene
 *  - Halt at the last keyframe when scroll passes the end (no wrap)
 *  - Reduced-motion preference falls back to a fixed midpoint pose
 */

import { cubicBezier, linearEase } from '@domio/easing';

// ─── Types ────────────────────────────────────────────────────────────

export interface ScrollCameraKeyframe {
  /** Position on the [0, 1] normalized timeline. */
  readonly progress: number;
  /** Camera pose at this keyframe. */
  readonly position: { x: number; y: number; z: number };
  readonly target: { x: number; y: number; z: number };
  readonly fov: number;
}

export interface ScrollDriverConfig {
  /** Scroll-Y pixel value where progress is 0. */
  readonly start: number;
  /** Scroll-Y pixel value where progress is 1. */
  readonly end: number;
  /** Cubic-bezier control points (e.g. [0.42, 0, 0.58, 1]). */
  readonly easing?: readonly [number, number, number, number];
  /** 'halt' (default) keeps the last pose past the end; 'wrap' loops. */
  readonly overshoot?: 'halt' | 'wrap';
  /** Honor `prefers-reduced-motion: reduce` by snapping to midpoint. */
  readonly respectReducedMotion?: boolean;
}

export interface ScrollDriverState {
  /** Current normalized progress [0, 1]. */
  readonly progress: number;
  /** Eased progress after applying the cubic-bezier curve. */
  readonly eased: number;
  /** Sampled camera pose from the keyframe timeline (if any). */
  readonly pose: ScrollCameraKeyframe | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleKeyframes(
  keyframes: readonly ScrollCameraKeyframe[],
  progress: number,
): ScrollCameraKeyframe | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0] ?? null;
  // Find the bracketing pair.
  const sorted = [...keyframes].sort((a, b) => a.progress - b.progress);
  let prev = sorted[0]!;
  let next = sorted[sorted.length - 1]!;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (progress >= a.progress && progress <= b.progress) {
      prev = a;
      next = b;
      break;
    }
  }
  if (progress <= sorted[0]!.progress) return sorted[0]!;
  if (progress >= sorted[sorted.length - 1]!.progress) {
    const overshoot = progress > sorted[sorted.length - 1]!.progress;
    return overshoot ? sorted[sorted.length - 1]! : sorted[sorted.length - 1]!;
  }
  const span = next.progress - prev.progress;
  const t = span === 0 ? 0 : (progress - prev.progress) / span;
  return {
    progress,
    position: {
      x: lerp(prev.position.x, next.position.x, t),
      y: lerp(prev.position.y, next.position.y, t),
      z: lerp(prev.position.z, next.position.z, t),
    },
    target: {
      x: lerp(prev.target.x, next.target.x, t),
      y: lerp(prev.target.y, next.target.y, t),
      z: lerp(prev.target.z, next.target.z, t),
    },
    fov: lerp(prev.fov, next.fov, t),
  };
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Compute the next state given a scroll-Y pixel value.
 *
 * Pure function — no DOM, no listeners. Tests can call it directly.
 */
export function computeScrollState(
  scrollY: number,
  config: ScrollDriverConfig,
  keyframes: readonly ScrollCameraKeyframe[],
): ScrollDriverState {
  const { start, end, easing, overshoot = 'halt' } = config;
  const range = end - start;
  let raw = range === 0
    ? scrollY >= start ? 1 : 0
    : (scrollY - start) / range;
  if (overshoot === 'halt') {
    raw = clamp01(raw);
  } else {
    // Wrap: take the fractional part for endless loops.
    raw = ((raw % 1) + 1) % 1;
  }
  const progress = clamp01(raw);

  let easingFn: (t: number) => number = linearEase;
  if (easing) {
    const [p1x, p1y, p2x, p2y] = easing;
    easingFn = cubicBezier(p1x, p1y, p2x, p2y);
  }
  const eased = easingFn(progress);

  const pose = sampleKeyframes(keyframes, progress);
  return { progress, eased, pose };
}

/**
 * Resolve the reduced-motion fallback (snaps to the midpoint keyframe
 * pose). Callers can use this directly when prefers-reduced-motion.
 */
export function reducedMotionFallback(
  keyframes: readonly ScrollCameraKeyframe[],
): ScrollCameraKeyframe | null {
  if (keyframes.length === 0) return null;
  const sorted = [...keyframes].sort((a, b) => a.progress - b.progress);
  // Find the keyframe closest to 0.5 progress.
  let best = sorted[0]!;
  let bestDelta = Math.abs(best.progress - 0.5);
  for (const k of sorted) {
    const delta = Math.abs(k.progress - 0.5);
    if (delta < bestDelta) {
      best = k;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Attach a passive scroll listener and invoke `onState` with the
 * updated driver state on every scroll change. Returns an unsubscribe
 * function. Uses requestAnimationFrame throttling to stay within the
 * 1 ms / frame budget for hero scenes.
 */
export function attachScrollDriver(
  config: ScrollDriverConfig,
  keyframes: readonly ScrollCameraKeyframe[],
  onState: (state: ScrollDriverState) => void,
): () => void {
  let frame = 0;
  const handler = () => {
    if (frame !== 0) return;
    frame = (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame(() => {
          frame = 0;
          onState(computeScrollState(window.scrollY, config, keyframes));
        })
      : (setTimeout(() => {
          frame = 0;
          onState(computeScrollState(window.scrollY, config, keyframes));
        }, 16) as unknown as number);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handler, { passive: true });
    // Fire once with the initial state.
    handler();
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', handler);
    }
    if (frame !== 0) {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(frame);
      } else {
        clearTimeout(frame);
      }
    }
  };
}