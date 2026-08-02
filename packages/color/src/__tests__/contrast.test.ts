import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { relativeLuminance, wcagContrast, apcaContrast } from '../contrast.js';
import type { SrgbColor } from '../types.js';

const WHITE: SrgbColor = { r: 1, g: 1, b: 1 };
const BLACK: SrgbColor = { r: 0, g: 0, b: 0 };

const arbSrgb: fc.Arbitrary<SrgbColor> = fc.record({
  r: fc.float({ min: 0, max: 1, noNaN: true }),
  g: fc.float({ min: 0, max: 1, noNaN: true }),
  b: fc.float({ min: 0, max: 1, noNaN: true }),
});

// ── WCAG contrast ────────────────────────────────────────────────────

describe('wcagContrast — golden values', () => {
  it('white vs black = 21:1', () => {
    expect(wcagContrast(WHITE, BLACK)).toBeCloseTo(21, 6);
  });

  it('black vs white = 21:1', () => {
    expect(wcagContrast(BLACK, WHITE)).toBeCloseTo(21, 6);
  });

  it('#777 vs white ≈ 4.48:1', () => {
    const gray777: SrgbColor = { r: 119 / 255, g: 119 / 255, b: 119 / 255 };
    expect(wcagContrast(gray777, WHITE)).toBeCloseTo(4.48, 1);
  });

  it('#FF0000 vs white ≈ 4.0:1', () => {
    expect(wcagContrast({ r: 1, g: 0, b: 0 }, WHITE)).toBeCloseTo(4.0, 1);
  });

  it('same colour → 1:1', () => {
    expect(wcagContrast(WHITE, WHITE)).toBeCloseTo(1, 6);
  });
});

describe('wcagContrast — properties', () => {
  it('always in [1, 21] (fast-check)', () => {
    fc.assert(
      fc.property(arbSrgb, arbSrgb, (fg, bg) => {
        const ratio = wcagContrast(fg, bg);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21.000001);
      }),
      { numRuns: 2000 },
    );
  });

  it('symmetric: contrast(fg,bg) == contrast(bg,fg) (fast-check)', () => {
    fc.assert(
      fc.property(arbSrgb, arbSrgb, (fg, bg) => {
        expect(wcagContrast(fg, bg)).toBeCloseTo(wcagContrast(bg, fg), 10);
      }),
      { numRuns: 2000 },
    );
  });
});

// ── relativeLuminance ────────────────────────────────────────────────

describe('relativeLuminance', () => {
  it('white → 1, black → 0', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
  });

  it('always in [0, 1] (fast-check)', () => {
    fc.assert(
      fc.property(arbSrgb, (rgb) => {
        const L = relativeLuminance(rgb);
        expect(L).toBeGreaterThanOrEqual(-0.000001);
        expect(L).toBeLessThanOrEqual(1.000001);
      }),
      { numRuns: 2000 },
    );
  });
});

// ── APCA ─────────────────────────────────────────────────────────────

describe('apcaContrast — known reference values', () => {
  it('white on black ≈ |106|', () => {
    const lc = apcaContrast(WHITE, BLACK);
    expect(Math.abs(lc)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(lc)).toBeLessThanOrEqual(115);
  });

  it('black on white ≈ |106|', () => {
    const lc = apcaContrast(BLACK, WHITE);
    expect(Math.abs(lc)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(lc)).toBeLessThanOrEqual(115);
  });

  it('same colour → Lc ≈ 0', () => {
    expect(Math.abs(apcaContrast(WHITE, WHITE))).toBeLessThanOrEqual(1);
    expect(Math.abs(apcaContrast(BLACK, BLACK))).toBeLessThanOrEqual(1);
  });
});

describe('apcaContrast — properties', () => {
  it('antisymmetry: |Lc(a,b) + Lc(b,a)| ≤ small (fast-check)', () => {
    // APCA uses different exponents for normal vs reverse polarity, so
    // perfect antisymmetry does not hold; the sum is bounded by a small
    // constant for most practical inputs (near-black soft-clipping being
    // the worst case).
    fc.assert(
      fc.property(arbSrgb, arbSrgb, (a, b) => {
        const lc_ab = apcaContrast(a, b);
        const lc_ba = apcaContrast(b, a);
        expect(Math.abs(lc_ab + lc_ba)).toBeLessThanOrEqual(3);
      }),
      { numRuns: 2000 },
    );
  });

  it('range within [-108, 106] (fast-check)', () => {
    fc.assert(
      fc.property(arbSrgb, arbSrgb, (fg, bg) => {
        const lc = apcaContrast(fg, bg);
        expect(lc).toBeGreaterThanOrEqual(-109);
        expect(lc).toBeLessThanOrEqual(107);
      }),
      { numRuns: 2000 },
    );
  });
});
