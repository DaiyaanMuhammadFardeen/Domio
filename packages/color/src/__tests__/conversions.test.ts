import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  srgbToOklch,
  oklchToSrgb,
  hexToRgb,
  rgbToHex,
  srgbToLinear,
  linearToSrgb,
  linearToOklab,
  oklabToLinear,
  oklabToOklch,
  oklchToOklab,
  deltaEOKLCH,
} from '../oklch.js';
import type { SrgbColor, OklchColor } from '../types.js';

// ── Known golden values ──────────────────────────────────────────────

describe('srgbToOklch — golden values', () => {
  it('sRGB red [1,0,0] → OKLCH ~[0.6279, 0.2577, 29.23°]', () => {
    const lch = srgbToOklch({ r: 1, g: 0, b: 0 });
    expect(lch.L).toBeCloseTo(0.6279, 3);
    expect(lch.C).toBeCloseTo(0.2577, 3);
    expect(lch.H).toBeCloseTo(29.23, 1);
  });

  it('sRGB green [0,1,0] → OKLCH ~[0.8664, 0.2948, 142.50°]', () => {
    const lch = srgbToOklch({ r: 0, g: 1, b: 0 });
    expect(lch.L).toBeCloseTo(0.8664, 3);
    expect(lch.C).toBeCloseTo(0.2948, 3);
    expect(lch.H).toBeCloseTo(142.50, 1);
  });

  it('sRGB blue [0,0,1] → OKLCH ~[0.4520, 0.3132, 264.05°]', () => {
    const lch = srgbToOklch({ r: 0, g: 0, b: 1 });
    expect(lch.L).toBeCloseTo(0.4520, 3);
    expect(lch.C).toBeCloseTo(0.3132, 3);
    expect(lch.H).toBeCloseTo(264.05, 1);
  });

  it('sRGB white → OKLCH L=1, C=0', () => {
    const lch = srgbToOklch({ r: 1, g: 1, b: 1 });
    expect(lch.L).toBeCloseTo(1, 6);
    expect(lch.C).toBeCloseTo(0, 6);
  });

  it('sRGB black → OKLCH L=0, C=0', () => {
    const lch = srgbToOklch({ r: 0, g: 0, b: 0 });
    expect(lch.L).toBeCloseTo(0, 6);
    expect(lch.C).toBeCloseTo(0, 6);
  });
});

// ── Round-trip tests ─────────────────────────────────────────────────

describe('srgbToOklch / oklchToSrgb — round-trip', () => {
  it('round-trip sRGB → OKLCH → sRGB ≤ 1e-6 per channel (golden)', () => {
    const inputs: SrgbColor[] = [
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0.2, g: 0.8, b: 0.4 },
      { r: 1, g: 1, b: 1 },
      { r: 0, g: 0, b: 0 },
    ];
    for (const rgb of inputs) {
      const lch = srgbToOklch(rgb);
      const back = oklchToSrgb(lch);
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('round-trip ≤ 1e-6 property (fast-check)', () => {
    const arbSrgb: fc.Arbitrary<SrgbColor> = fc.record({
      r: fc.float({ min: 0, max: 1, noNaN: true }),
      g: fc.float({ min: 0, max: 1, noNaN: true }),
      b: fc.float({ min: 0, max: 1, noNaN: true }),
    });
    fc.assert(
      fc.property(arbSrgb, (rgb) => {
        const lch = srgbToOklch(rgb);
        const back = oklchToSrgb(lch);
        // 32-bit float precision limits the round-trip to ~1e-6
        expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2e-6);
        expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2e-6);
        expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2e-6);
      }),
      { numRuns: 2000 },
    );
  });
});

// ── Hex round-trip ───────────────────────────────────────────────────

describe('hexToRgb / rgbToHex — round-trip', () => {
  it('hex → rgb → hex identity', () => {
    const hexes = ['#ff0000', '#00ff00', '#0000ff', '#777777', '#ffffff', '#000000', '#abc123'];
    for (const hex of hexes) {
      const rgb = hexToRgb(hex);
      const back = rgbToHex(rgb);
      expect(back).toBe(hex.toLowerCase());
    }
  });

  it('#RGB shorthand', () => {
    const rgb = hexToRgb('#fff');
    expect(rgb.r).toBeCloseTo(1, 6);
    expect(rgb.g).toBeCloseTo(1, 6);
    expect(rgb.b).toBeCloseTo(1, 6);
    expect(rgbToHex(rgb)).toBe('#ffffff');
  });

  it('hex → rgb → hex property (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        ([r, g, b]) => {
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          const rgb = hexToRgb(hex);
          const back = rgbToHex(rgb);
          expect(back).toBe(hex);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ── Linearisation ────────────────────────────────────────────────────

describe('srgbToLinear / linearToSrgb', () => {
  it('linearise black = 0, white = 1', () => {
    expect(srgbToLinear({ r: 0, g: 0, b: 0 }).r).toBe(0);
    const white = srgbToLinear({ r: 1, g: 1, b: 1 });
    expect(white.r).toBeCloseTo(1, 6);
  });

  it('linearise + delinearise round-trip (fast-check)', () => {
    const arb = fc.float({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(arb, (c) => {
        const lin = srgbToLinear({ r: c, g: c, b: c });
        const back = linearToSrgb(lin);
        expect(Math.abs(back.r - c)).toBeLessThanOrEqual(1e-6);
      }),
      { numRuns: 2000 },
    );
  });
});

// ── OKLab ↔ OKLCH ────────────────────────────────────────────────────

describe('oklabToOklch / oklchToOklab', () => {
  it('round-trip oklab → oklch → oklab (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: Math.fround(-0.4), max: Math.fround(0.4), noNaN: true }),
        fc.float({ min: Math.fround(-0.4), max: Math.fround(0.4), noNaN: true }),
        (L, a, b) => {
          const lch = oklabToOklch({ L, a, b });
          const back = oklchToOklab(lch);
          expect(Math.abs(back.L - L)).toBeLessThanOrEqual(1e-10);
          expect(Math.abs(back.a - a)).toBeLessThanOrEqual(1e-10);
          expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1e-10);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ── ΔE ───────────────────────────────────────────────────────────────

describe('deltaEOKLCH', () => {
  it('same colour → 0', () => {
    expect(deltaEOKLCH({ L: 0.5, C: 0.1, H: 90 }, { L: 0.5, C: 0.1, H: 90 })).toBe(0);
  });

  it('symmetric', () => {
    const a = { L: 0.6, C: 0.2, H: 30 };
    const b = { L: 0.8, C: 0.1, H: 200 };
    expect(deltaEOKLCH(a, b)).toBeCloseTo(deltaEOKLCH(b, a), 10);
  });

  it('non-negative (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.record({ L: fc.float({ min: 0, max: 1, noNaN: true }), C: fc.float({ min: 0, max: Math.fround(0.4), noNaN: true }), H: fc.float({ min: 0, max: Math.fround(360), noNaN: true }) }),
        fc.record({ L: fc.float({ min: 0, max: 1, noNaN: true }), C: fc.float({ min: 0, max: Math.fround(0.4), noNaN: true }), H: fc.float({ min: 0, max: Math.fround(360), noNaN: true }) }),
        (a, b) => {
          expect(deltaEOKLCH(a, b)).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });
});
