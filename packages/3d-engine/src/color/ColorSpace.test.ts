import { describe, it, expect } from 'vitest';
import {
  linearToSRGB,
  sRGBToLinear,
  hexToLinear,
  linearToHex,
  hexRoundtrip,
  applyColorSpace,
} from './ColorSpace.js';

describe('ColorSpace', () => {
  describe('linearToSRGB', () => {
    it('converts known value: 0.5 linear ≈ 0.715 sRGB (piecewise approximation)', () => {
      const result = linearToSRGB(0.5);
      // Piecewise: 1.055 * pow(0.5, 1/2.2) - 0.055
      // ≈ 1.055 * 0.7297 - 0.055 ≈ 0.7149
      expect(result).toBeCloseTo(0.715, 2);
    });

    it('converts 0 to 0', () => {
      expect(linearToSRGB(0)).toBe(0);
    });

    it('converts 1 to 1', () => {
      expect(linearToSRGB(1)).toBeCloseTo(1, 6);
    });

    it('clamps negative values to 0', () => {
      expect(linearToSRGB(-0.5)).toBe(0);
    });

    it('clamps values above 1 to 1', () => {
      expect(linearToSRGB(1.5)).toBeCloseTo(1, 6);
    });
  });

  describe('sRGBToLinear', () => {
    it('converts 0 to 0', () => {
      expect(sRGBToLinear(0)).toBe(0);
    });

    it('converts 1 to ~1', () => {
      expect(sRGBToLinear(1)).toBeCloseTo(1, 4);
    });

    it('inverse of linearToSRGB within tolerance', () => {
      const linear = 0.5;
      const srgb = linearToSRGB(linear);
      const roundtrip = sRGBToLinear(srgb);
      expect(roundtrip).toBeCloseTo(linear, 4);
    });
  });

  describe('hex conversions', () => {
    it('hexToLinear parses #ff0000 correctly', () => {
      const [r, g, b] = hexToLinear('#ff0000');
      expect(r).toBeCloseTo(1, 4);
      expect(g).toBeCloseTo(0, 4);
      expect(b).toBeCloseTo(0, 4);
    });

    it('linearToHex converts back to hex', () => {
      const hex = linearToHex(1, 0, 0);
      expect(hex).toBe('#ff0000');
    });

    it('roundtrip within epsilon', () => {
      const original = '#804020';
      const roundtripped = hexRoundtrip(original);
      // Parse both and compare linear values
      const [or, og, ob] = hexToLinear(original);
      const [rr, rg, rb] = hexToLinear(roundtripped);
      expect(Math.abs(or - rr)).toBeLessThan(0.01);
      expect(Math.abs(og - rg)).toBeLessThan(0.01);
      expect(Math.abs(ob - rb)).toBeLessThan(0.01);
    });
  });

  describe('lossless mode', () => {
    it('lossless returns input unchanged', () => {
      expect(applyColorSpace(0.5, true)).toBe(0.5);
    });

    it('non-lossless applies conversion', () => {
      const result = applyColorSpace(0.5, false);
      expect(result).not.toBe(0.5);
      expect(result).toBeCloseTo(linearToSRGB(0.5), 6);
    });
  });
});
