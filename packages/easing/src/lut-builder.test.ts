import { describe, it, expect } from 'vitest';
import { buildLut } from './lut-builder.js';
import { cubicBezier } from './cubic.js';

describe('buildLut', () => {
  it('returns Float64Array of requested size', () => {
    const lut = buildLut((t) => t, 256);
    expect(lut).toBeInstanceOf(Float64Array);
    expect(lut.length).toBe(256);
  });

  it('values clamped to [-0.25, 1.25]', () => {
    // A function that would overshoot
    const lut = buildLut(() => 1.5, 256);
    for (let i = 0; i < lut.length; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(-0.25);
      expect(lut[i]).toBeLessThanOrEqual(1.25);
    }
  });

  it('linear ease produces evenly-spaced values', () => {
    const lut = buildLut((t) => t, 256);
    for (let i = 0; i < lut.length; i++) {
      expect(lut[i]).toBeCloseTo(i / (lut.length - 1), 10);
    }
  });

  it('completes in < 5 ms for standard ease', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1.0);
    const start = performance.now();
    buildLut(ease, 256);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it('first entry is 0, last entry is 1 for cubic bezier', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    const lut = buildLut(ease, 256);
    expect(lut[0]).toBe(0);
    expect(lut[lut.length - 1]).toBe(1);
  });

  it('defaults to 256 entries', () => {
    const lut = buildLut((t) => t);
    expect(lut.length).toBe(256);
  });
});
