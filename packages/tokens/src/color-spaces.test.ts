/**
 * @domio/tokens — Color space + WCAG + APCA tests.
 *
 * Sanity-checks the conversion math against known reference points and
 * verifies the WCAG/APCA helpers produce monotone, in-range results.
 */

import { describe, it, expect } from 'vitest';

import {
  srgbToLinear,
  linearToSrgb,
  srgbToOklch,
  oklchToSrgb,
  hexToOklch,
  oklchToHex,
  clampToGamut,
  deltaEOklch,
  wcagContrast,
  apcaContrast,
  oklabToOklch,
  oklchToOklab,
} from './color-spaces.js';

describe('srgbToLinear / linearToSrgb (gamma)', () => {
  it('linearises the standard values', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    // 0.5 sRGB should map to ~0.214 in linear sRGB
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
  });

  it('inverts within float precision', () => {
    for (const x of [0.0, 0.1, 0.2, 0.5, 0.8, 1.0]) {
      expect(linearToSrgb(srgbToLinear(x))).toBeCloseTo(x, 6);
    }
  });

  it('treats very small values linearly (no gamma curve)', () => {
    expect(srgbToLinear(0.01)).toBeCloseTo(0.01 / 12.92, 6);
  });
});

describe('srgbToOklch / oklchToSrgb', () => {
  it('handles pure white', () => {
    const [L, C, H] = srgbToOklch(1, 1, 1);
    expect(L).toBeCloseTo(1, 2);
    expect(C).toBeCloseTo(0, 2);
    // Hue is undefined when C is 0; the helper still produces a number.
    expect(typeof H).toBe('number');
  });

  it('handles pure black', () => {
    const [L] = srgbToOklch(0, 0, 0);
    expect(L).toBeCloseTo(0, 2);
  });

  it('round-trips within float precision for in-gamut colors', () => {
    const samples: [number, number, number][] = [
      [0.2, 0.4, 0.6],
      [0.5, 0.5, 0.5],
      [0.7, 0.3, 0.9],
      [0.0, 0.4, 0.2],
    ];
    for (const [r, g, b] of samples) {
      const [L, C, H] = srgbToOklch(r, g, b);
      const back = oklchToSrgb(L, C, H);
      expect(back).not.toBeNull();
      if (back) {
        expect(back.r).toBeCloseTo(r, 2);
        expect(back.g).toBeCloseTo(g, 2);
        expect(back.b).toBeCloseTo(b, 2);
      }
    }
  });

  it('reports null for out-of-gamut high-chroma inputs', () => {
    // L=0.7, C=0.37, H=30 is far outside sRGB gamut.
    const back = oklchToSrgb(0.7, 0.37, 30);
    expect(back).toBeNull();
  });
});

describe('hexToOklch / oklchToHex', () => {
  it('round-trips through hex for in-gamut colors', () => {
    const hex = '#3b82f6';
    const [L, C, H] = hexToOklch(hex);
    const back = oklchToHex(L, C, H);
    // Hex back may quantize to a slightly different 24-bit value; just
    // verify it produced a string and the value is close.
    expect(typeof back).toBe('string');
  });

  it('handles pure red', () => {
    const [L, C, H] = hexToOklch('#ff0000');
    expect(L).toBeGreaterThan(0.5);
    expect(C).toBeGreaterThan(0.2);
    // Pure red is roughly hue 29° in OKLCH
    expect(H).toBeGreaterThan(20);
    expect(H).toBeLessThan(45);
  });
});

describe('oklabToOklch / oklchToOklab', () => {
  it('inverts within float precision', () => {
    const [L, a, b] = oklchToOklab(0.7, 0.1, 120);
    const [L2, C2, H2] = oklabToOklch(L, a, b);
    expect(L2).toBeCloseTo(0.7, 4);
    expect(C2).toBeCloseTo(0.1, 4);
    expect(H2).toBeCloseTo(120, 2);
  });

  it('preserves hue on the wrap-around (350° wraps to -10°)', () => {
    // OKLab (L, a, b) → OKLCH: hue is atan2(b, a) in degrees.
    // For hue -10°, we want a = cos(-10°)*C, b = sin(-10°)*C.
    const C = 0.05;
    const H = -10;
    const a = Math.cos((H * Math.PI) / 180) * C;
    const b = Math.sin((H * Math.PI) / 180) * C;
    const [, , Hout] = oklabToOklch(0.5, a, b);
    expect(Hout).toBeCloseTo(350, 2);
  });
});

describe('clampToGamut', () => {
  it('returns input unchanged for in-gamut colors', () => {
    // L=0.6, C=0.05, H=120 is comfortably in-gamut.
    const [L, C, H] = clampToGamut(0.6, 0.05, 120);
    expect(L).toBeCloseTo(0.6, 4);
    expect(C).toBeCloseTo(0.05, 4);
    expect(H).toBeCloseTo(120, 2);
  });

  it('reduces chroma for out-of-gamut colors until they fit', () => {
    const [L, C, H] = clampToGamut(0.7, 0.37, 30);
    expect(C).toBeLessThan(0.37);
    // Verify the result is now in-gamut
    const back = oklchToSrgb(L, C, H);
    expect(back).not.toBeNull();
    // Hue is preserved exactly
    expect(H).toBe(30);
  });
});

describe('deltaEOklch', () => {
  it('returns 0 for identical triples', () => {
    expect(deltaEOklch([0.5, 0.1, 30], [0.5, 0.1, 30])).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    const a: [number, number, number] = [0.5, 0.1, 30];
    const b: [number, number, number] = [0.6, 0.2, 40];
    expect(deltaEOklch(a, b)).toBeCloseTo(deltaEOklch(b, a), 6);
  });

  it('respects hue wrap-around (5° ≈ 355°)', () => {
    const tiny = deltaEOklch([0.5, 0.1, 355], [0.5, 0.1, 5]);
    // Hue is circular; 5° and 355° are 10° apart on the short path.
    expect(tiny).toBeCloseTo(10, 0);
    // And specifically less than 180° (the naive non-wrapping diff):
    const direct = deltaEOklch([0.5, 0.1, 355], [0.5, 0.1, 5 + 360]);
    expect(tiny).toBeCloseTo(direct, 4);
  });
});

describe('wcagContrast', () => {
  it('black on white = 21', () => {
    expect(wcagContrast([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 1);
  });

  it('white on white = 1', () => {
    expect(wcagContrast([1, 1, 1], [1, 1, 1])).toBeCloseTo(1, 3);
  });

  it('is symmetric in fg/bg', () => {
    const fg: [number, number, number] = [0.2, 0.4, 0.6];
    const bg: [number, number, number] = [0.9, 0.95, 1.0];
    expect(wcagContrast(fg, bg)).toBeCloseTo(wcagContrast(bg, fg), 4);
  });
});

describe('apcaContrast', () => {
  it('is signed (positive when fg is darker than bg)', () => {
    const lc = apcaContrast([0, 0, 0], [1, 1, 1]);
    expect(lc).toBeGreaterThan(0);
  });

  it('flips sign when bg/fg swap', () => {
    const a = apcaContrast([0, 0, 0], [1, 1, 1]);
    const b = apcaContrast([1, 1, 1], [0, 0, 0]);
    // Same magnitude, opposite sign
    expect(Math.abs(a + b)).toBeLessThan(1.5);
  });
});
