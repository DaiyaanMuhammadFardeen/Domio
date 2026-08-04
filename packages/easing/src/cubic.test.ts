import { describe, it, expect } from 'vitest';
import { cubicBezier } from './cubic.js';

describe('cubicBezier', () => {
  it('cubicBezier(...)(0) === 0', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(ease(0)).toBe(0);
  });

  it('cubicBezier(...)(1) === 1', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(ease(1)).toBe(1);
  });

  it('output is clamped to [-0.25, 1.25]', () => {
    // A curve that would overshoot significantly
    const ease = cubicBezier(0.68, -0.55, 0.27, 1.55);
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(-0.25);
      expect(v).toBeLessThanOrEqual(1.25);
    }
  });

  it('degenerate x1 === x2 === 0 falls back to linear', () => {
    const ease = cubicBezier(0, 0, 0, 0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5, 5);
    expect(ease(1)).toBe(1);
  });

  it('degenerate x1 === x2 === 1 falls back to linear', () => {
    const ease = cubicBezier(1, 0, 1, 0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5, 5);
    expect(ease(1)).toBe(1);
  });

  it('is monotonically increasing for a standard ease curve', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    let prev = ease(0);
    for (let i = 1; i <= 100; i++) {
      const t = i / 100;
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('returns 0 for t <= 0 and 1 for t >= 1', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(ease(-0.1)).toBe(0);
    expect(ease(1.1)).toBe(1);
  });
});
