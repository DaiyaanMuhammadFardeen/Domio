import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { remapForDarkMode, remapForLightMode } from '../remap.js';
import type { OklchColor } from '../types.js';

const arbOklch: fc.Arbitrary<OklchColor> = fc.record({
  L: fc.float({ min: 0, max: 1, noNaN: true }),
  C: fc.float({ min: 0, max: Math.fround(0.4), noNaN: true }),
  H: fc.float({ min: 0, max: Math.fround(360), noNaN: true }),
});

describe('remapForDarkMode', () => {
  it('bright (L=0.95) → dark (L=0.18)', () => {
    const result = remapForDarkMode({ L: 0.95, C: 0.2, H: 30 });
    expect(result.value.L).toBeCloseTo(0.18, 4);
  });

  it('dark (L=0.05) → bright (L=0.85)', () => {
    const result = remapForDarkMode({ L: 0.05, C: 0.2, H: 30 });
    expect(result.value.L).toBeCloseTo(0.85, 4);
  });

  it('mid-tone (L=0.5) stays near mid (L≈0.5)', () => {
    const result = remapForDarkMode({ L: 0.5, C: 0.15, H: 120 });
    // Smoothstep preserves middle as roughly 0.5
    expect(result.value.L).toBeGreaterThan(0.35);
    expect(result.value.L).toBeLessThan(0.65);
  });

  it('hue drift is always 0°', () => {
    expect(
      remapForDarkMode({ L: 0.5, C: 0.2, H: 177 }).hueDriftDeg,
    ).toBe(0);
  });

  it('chroma reduced by default (15%)', () => {
    const result = remapForDarkMode({ L: 0.5, C: 0.2, H: 90 });
    expect(result.value.C).toBeCloseTo(0.17, 4);
    expect(result.chromaDriftPct).toBeCloseTo(15, 0);
  });

  it('property: L stays in [0,1] for all inputs', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { value } = remapForDarkMode(lch);
        expect(value.L).toBeGreaterThanOrEqual(-0.001);
        expect(value.L).toBeLessThanOrEqual(1.001);
      }),
      { numRuns: 2000 },
    );
  });

  it('property: hue drift ≤ 10°', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { hueDriftDeg } = remapForDarkMode(lch);
        expect(hueDriftDeg).toBeLessThanOrEqual(10);
      }),
      { numRuns: 2000 },
    );
  });

  it('property: chroma drift ≤ 20%', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { chromaDriftPct } = remapForDarkMode(lch);
        expect(chromaDriftPct).toBeLessThanOrEqual(20.001);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('remapForLightMode', () => {
  it('dark (L=0.05) → light (L=0.95)', () => {
    const result = remapForLightMode({ L: 0.05, C: 0.2, H: 30 });
    expect(result.value.L).toBeCloseTo(0.95, 4);
  });

  it('mid-dark (L=0.85) → mid-light (L=0.05)', () => {
    const result = remapForLightMode({ L: 0.85, C: 0.2, H: 30 });
    expect(result.value.L).toBeCloseTo(0.05, 4);
  });

  it('hue drift is always 0°', () => {
    expect(
      remapForLightMode({ L: 0.5, C: 0.2, H: 177 }).hueDriftDeg,
    ).toBe(0);
  });

  it('property: L stays in [0,1] for all inputs', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { value } = remapForLightMode(lch);
        expect(value.L).toBeGreaterThanOrEqual(-0.001);
        expect(value.L).toBeLessThanOrEqual(1.001);
      }),
      { numRuns: 2000 },
    );
  });

  it('property: hue drift ≤ 10°', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { hueDriftDeg } = remapForLightMode(lch);
        expect(hueDriftDeg).toBeLessThanOrEqual(10);
      }),
      { numRuns: 2000 },
    );
  });

  it('property: chroma drift ≤ 20% (default chromaFactor=1.0)', () => {
    fc.assert(
      fc.property(arbOklch, (lch) => {
        const { chromaDriftPct } = remapForLightMode(lch);
        expect(chromaDriftPct).toBeLessThanOrEqual(20.001);
      }),
      { numRuns: 2000 },
    );
  });
});
