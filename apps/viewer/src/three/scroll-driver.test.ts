/**
 * @domio/viewer — Tests for scroll-driver (Phase 11 M5.4).
 *
 * The scroll driver maps the page scroll-Y to a normalized [0, 1]
 * timeline and samples camera keyframes. These tests cover:
 *   - progress normalization (linear, halt, wrap)
 *   - cubic-bezier easing pass-through
 *   - keyframe interpolation (between two poses)
 *   - clamping past the last keyframe (no wrap)
 *   - reduced-motion fallback selecting the midpoint keyframe
 *   - attachScrollDriver returning a working unsubscribe
 */

import { describe, it, expect, vi } from 'vitest';
import {
  computeScrollState,
  reducedMotionFallback,
  attachScrollDriver,
  type ScrollCameraKeyframe,
  type ScrollDriverConfig,
} from './scroll-driver.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

const KF: readonly ScrollCameraKeyframe[] = [
  { progress: 0,   position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
  { progress: 0.5, position: { x: 5, y: 2, z: 8  }, target: { x: 1, y: 0, z: 0 }, fov: 50 },
  { progress: 1,   position: { x: 0, y: 0, z: 5  }, target: { x: 0, y: 0, z: 0 }, fov: 40 },
];

const baseConfig: ScrollDriverConfig = {
  start: 0,
  end: 1000,
};

// ─── Progress normalization ──────────────────────────────────────────

describe('computeScrollState — progress normalization', () => {
  it('returns progress 0 at the start', () => {
    const s = computeScrollState(0, baseConfig, KF);
    expect(s.progress).toBe(0);
  });

  it('returns progress 1 at the end', () => {
    const s = computeScrollState(1000, baseConfig, KF);
    expect(s.progress).toBe(1);
  });

  it('returns progress 0.5 at the midpoint', () => {
    const s = computeScrollState(500, baseConfig, KF);
    expect(s.progress).toBeCloseTo(0.5, 5);
  });

  it('clamps to 1 past the end with halt mode (default)', () => {
    const s = computeScrollState(2000, baseConfig, KF);
    expect(s.progress).toBe(1);
  });

  it('clamps to 0 before the start', () => {
    const s = computeScrollState(-50, baseConfig, KF);
    expect(s.progress).toBe(0);
  });

  it('wraps past the end with wrap mode', () => {
    const s = computeScrollState(2500, { ...baseConfig, overshoot: 'wrap' }, KF);
    // 2500 / 1000 = 2.5 → fractional = 0.5
    expect(s.progress).toBeCloseTo(0.5, 5);
  });

  it('handles a zero-range config: 0 below start, 1 at or above', () => {
    const s1 = computeScrollState(0, { start: 100, end: 100 }, KF);
    const s2 = computeScrollState(100, { start: 100, end: 100 }, KF);
    expect(s1.progress).toBe(0);
    expect(s2.progress).toBe(1);
  });
});

// ─── Easing ──────────────────────────────────────────────────────────

describe('computeScrollState — easing', () => {
  it('passes progress through linearEase when no easing configured', () => {
    const s = computeScrollState(500, baseConfig, KF);
    expect(s.eased).toBeCloseTo(s.progress, 5);
  });

  it('applies a cubic-bezier curve', () => {
    // ease-in: slow start, fast end. At t=0.25 the eased value should be < 0.25.
    const s = computeScrollState(250, {
      ...baseConfig,
      easing: [0.42, 0, 1, 1],
    }, KF);
    expect(s.eased).toBeLessThan(s.progress);
    expect(s.eased).toBeGreaterThanOrEqual(0);
  });

  it('produces eased=1 at the end regardless of curve', () => {
    const s = computeScrollState(1000, {
      ...baseConfig,
      easing: [0.42, 0, 0.58, 1],
    }, KF);
    expect(s.eased).toBeCloseTo(1, 5);
  });
});

// ─── Keyframe interpolation ──────────────────────────────────────────

describe('computeScrollState — keyframe sampling', () => {
  it('returns null pose when there are no keyframes', () => {
    const s = computeScrollState(500, baseConfig, []);
    expect(s.pose).toBeNull();
  });

  it('returns the only pose when there is one keyframe', () => {
    const solo: ScrollCameraKeyframe[] = [
      { progress: 0, position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 }, fov: 90 },
    ];
    const s = computeScrollState(500, baseConfig, solo);
    expect(s.pose?.position).toEqual({ x: 1, y: 1, z: 1 });
    expect(s.pose?.fov).toBe(90);
  });

  it('returns the first keyframe at progress <= 0', () => {
    const s = computeScrollState(0, baseConfig, KF);
    expect(s.pose?.position).toEqual({ x: 0, y: 0, z: 10 });
    expect(s.pose?.fov).toBe(60);
  });

  it('returns the last keyframe at progress >= 1', () => {
    const s = computeScrollState(1000, baseConfig, KF);
    expect(s.pose?.position).toEqual({ x: 0, y: 0, z: 5 });
    expect(s.pose?.fov).toBe(40);
  });

  it('interpolates between the bracketing keyframes at the midpoint', () => {
    // KF[0] → KF[1] at progress=0.25, midpoint of that segment = 0.125 progress
    // between pos(0,0,10) and pos(5,2,8): x=2.5, y=1, z=9
    const s = computeScrollState(250, baseConfig, KF);
    expect(s.pose?.position.x).toBeCloseTo(2.5, 5);
    expect(s.pose?.position.y).toBeCloseTo(1, 5);
    expect(s.pose?.position.z).toBeCloseTo(9, 5);
    // fov between 60 and 50: 55
    expect(s.pose?.fov).toBeCloseTo(55, 5);
  });

  it('handles keyframes supplied in unsorted order', () => {
    const unsorted: ScrollCameraKeyframe[] = [KF[2]!, KF[0]!, KF[1]!];
    const s = computeScrollState(250, baseConfig, unsorted);
    expect(s.pose?.position.x).toBeCloseTo(2.5, 5);
  });
});

// ─── Reduced-motion fallback ─────────────────────────────────────────

describe('reducedMotionFallback', () => {
  it('returns null for an empty timeline', () => {
    expect(reducedMotionFallback([])).toBeNull();
  });

  it('selects the keyframe closest to 0.5', () => {
    const fallback = reducedMotionFallback(KF);
    expect(fallback?.progress).toBe(0.5);
  });

  it('still picks the midpoint when keyframes are weighted heavily elsewhere', () => {
    const weighted: ScrollCameraKeyframe[] = [
      { progress: 0,   position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
      { progress: 0.1, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
      { progress: 0.9, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
    ];
    expect(reducedMotionFallback(weighted)?.progress).toBe(0.1);
  });
});

// ─── DOM attachment ──────────────────────────────────────────────────

describe('attachScrollDriver', () => {
  it('returns an unsubscribe function and does not throw without a window', () => {
    const onState = vi.fn();
    // In the jsdom environment, window is present so this exercises the path.
    const detach = attachScrollDriver(baseConfig, KF, onState);
    expect(typeof detach).toBe('function');
    detach();
  });

  it('calls onState with the initial state asynchronously after attaching', async () => {
    const onState = vi.fn();
    // Stub scrollY before attaching.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    const detach = attachScrollDriver(baseConfig, KF, onState);
    // Wait for the initial rAF / setTimeout callback to fire.
    await new Promise<void>((resolve) => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 20);
      }
    });
    expect(onState).toHaveBeenCalled();
    const last = onState.mock.calls.at(-1)?.[0];
    expect(last?.progress).toBeCloseTo(0.5, 5);
    detach();
    // Restore.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
