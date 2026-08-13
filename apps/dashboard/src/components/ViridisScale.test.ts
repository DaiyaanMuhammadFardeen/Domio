import { describe, expect, it } from 'vitest';
import { intensityToColor, intensityToCss } from './ViridisScale';

describe('ViridisScale.intensityToColor', () => {
  it('clamps values below 0 to the cold stop', () => {
    const below = intensityToColor(-0.5);
    const zero = intensityToColor(0);
    expect(below).toEqual(zero);
  });

  it('clamps values above 1 to the hot stop', () => {
    const above = intensityToColor(1.5);
    const one = intensityToColor(1);
    expect(above).toEqual(one);
  });

  it('returns RGB tuples within byte range', () => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const [r, g, b] = intensityToColor(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
    }
  });

  it('produces monotonically non-decreasing perceived luminance', () => {
    // Rec. 709 luminance: Y = 0.2126 R + 0.7152 G + 0.0722 B
    function luma(rgb: readonly [number, number, number]): number {
      const [r, g, b] = rgb;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const l = luma(intensityToColor(t));
      // Allow tiny rounding tolerance: viridis is approximately
      // monotonic; deviations are bounded by 1.5 luma units.
      expect(l).toBeGreaterThanOrEqual(prev - 1.5);
      prev = l;
    }
  });

  it('intensityToCss returns a valid rgb() string', () => {
    expect(intensityToCss(0.5)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});
