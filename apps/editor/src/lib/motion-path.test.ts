/**
 * motion-path — Wave 2 §S2.11 unit tests.
 *
 * Validates path math + element-prop round-tripping.
 */

import { describe, expect, it } from 'vitest';
import {
  applyEasing,
  clearMotionPath,
  cubicBezierPoint,
  defaultMotionPath,
  readMotionPath,
  sampleMotionPath,
  writeMotionPath,
  type MotionPath,
} from './motion-path';

function samplePath(): MotionPath {
  return {
    id: 'mp-test',
    origin: { x: 0, y: 0 },
    keyframes: [
      { timeMs: 0, x: 0, y: 0, controlOut: null },
      { timeMs: 500, x: 100, y: 0, controlOut: null },
      { timeMs: 1000, x: 100, y: 100, controlOut: null },
    ],
  };
}

describe('motion-path', () => {
  it('defaultMotionPath returns a fresh 2-keyframe path', () => {
    const path = defaultMotionPath();
    expect(path.keyframes).toHaveLength(2);
    expect(path.origin).toEqual({ x: 0, y: 0 });
    expect(path.id).toMatch(/^mp-/);
  });

  it('sampleMotionPath clamps before the first keyframe to origin', () => {
    const sample = sampleMotionPath(samplePath(), -200);
    expect(sample.x).toBe(0);
    expect(sample.y).toBe(0);
  });

  it('sampleMotionPath holds the last anchor after the last keyframe (open path)', () => {
    const sample = sampleMotionPath(samplePath(), 5000);
    expect(sample.x).toBe(100);
    expect(sample.y).toBe(100);
  });

  it('sampleMotionPath wraps back to origin after the last keyframe (closed path)', () => {
    const path: MotionPath = { ...samplePath(), closed: true };
    const sample = sampleMotionPath(path, 5000);
    expect(sample.x).toBe(0);
    expect(sample.y).toBe(0);
  });

  it('sampleMotionPath at the midpoint of a horizontal segment returns the midpoint x', () => {
    const path = samplePath();
    const sample = sampleMotionPath(path, 250);
    expect(sample.x).toBeCloseTo(50, 0);
    expect(sample.y).toBeCloseTo(0, 0);
    expect(sample.segment).toBe(0);
  });

  it('sampleMotionPath returns the origin when there are no keyframes', () => {
    const sample = sampleMotionPath({ id: 'empty', origin: { x: 10, y: 5 }, keyframes: [] }, 500);
    expect(sample.x).toBe(10);
    expect(sample.y).toBe(5);
  });

  it('cubicBezierPoint matches the math at t=0 and t=1', () => {
    expect(cubicBezierPoint(0, 0, 50, -20, 100, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicBezierPoint(0, 0, 50, -20, 100, 0, 1)).toEqual({ x: 100, y: 0 });
  });

  it('applyEasing honours the named easing tokens', () => {
    expect(applyEasing(0.5, 'linear')).toBe(0.5);
    expect(applyEasing(0, 'ease-in')).toBe(0);
    expect(applyEasing(1, 'ease-in')).toBe(1);
    expect(applyEasing(0.5, 'ease-out')).toBeGreaterThan(0.5);
    expect(applyEasing(0.5, 'ease-in')).toBeLessThan(0.5);
    // Empty string falls back to linear
    expect(applyEasing(0.4, '')).toBe(0.4);
  });

  it('applyEasing parses cubic-bezier strings', () => {
    // cubic-bezier(0.42, 0, 0.58, 1) is the canonical ease-in-out curve.
    expect(applyEasing(0, 'cubic-bezier(0.42, 0, 0.58, 1)')).toBe(0);
    expect(applyEasing(1, 'cubic-bezier(0.42, 0, 0.58, 1)')).toBe(1);
    // At the midpoint, ease-in-out returns ~0.5
    expect(applyEasing(0.5, 'cubic-bezier(0.42, 0, 0.58, 1)')).toBeCloseTo(0.5, 1);
  });

  it('applyEasing returns linear t for unknown tokens', () => {
    expect(applyEasing(0.42, 'bogus-token')).toBe(0.42);
  });

  it('writeMotionPath + readMotionPath round-trip through component props', () => {
    const path = samplePath();
    const props = writeMotionPath({}, path);
    expect(readMotionPath(props)).toEqual(path);
  });

  it('readMotionPath returns null when the key is missing', () => {
    expect(readMotionPath(undefined)).toBeNull();
    expect(readMotionPath({})).toBeNull();
    expect(readMotionPath({ unrelated: 1 })).toBeNull();
  });

  it('clearMotionPath removes only the motion-path key', () => {
    const props = writeMotionPath({ foo: 'bar' }, samplePath());
    const cleared = clearMotionPath(props);
    expect(cleared.foo).toBe('bar');
    expect(readMotionPath(cleared)).toBeNull();
  });

  it('clearMotionPath on undefined returns an empty object', () => {
    expect(clearMotionPath(undefined)).toEqual({});
  });
});
