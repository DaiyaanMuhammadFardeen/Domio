import { describe, it, expect } from 'vitest';
import { hueSpacingDeg, isCvSafePalette, suggestCvSafePalette } from '../palette.js';
import type { OklchColor } from '../types.js';

describe('hueSpacingDeg', () => {
  it('empty/single palette → 180', () => {
    expect(hueSpacingDeg([])).toBe(180);
    expect(hueSpacingDeg([{ L: 0.5, C: 0.1, H: 90 }])).toBe(180);
  });

  it('two colours 90° apart → 90', () => {
    expect(hueSpacingDeg([
      { L: 0.5, C: 0.1, H: 0 },
      { L: 0.5, C: 0.1, H: 90 },
    ])).toBe(90);
  });

  it('wrap-around: 10° and 350° → 20', () => {
    expect(hueSpacingDeg([
      { L: 0.5, C: 0.1, H: 10 },
      { L: 0.5, C: 0.1, H: 350 },
    ])).toBe(20);
  });

  it('equidistant 6-colour palette (60° each) → 60', () => {
    const palette: OklchColor[] = Array.from({ length: 6 }, (_, i) => ({
      L: 0.6,
      C: 0.15,
      H: i * 60,
    }));
    expect(hueSpacingDeg(palette)).toBe(60);
  });

  it('≥ 30° spacing for suggested palette', () => {
    const seed: OklchColor[] = [
      { L: 0.6, C: 0.2, H: 0 },
      { L: 0.7, C: 0.15, H: 45 },
      { L: 0.5, C: 0.25, H: 120 },
      { L: 0.8, C: 0.1, H: 200 },
      { L: 0.4, C: 0.3, H: 300 },
    ];
    const result = suggestCvSafePalette(seed);
    expect(hueSpacingDeg(result)).toBeGreaterThanOrEqual(30);
  });
});

describe('suggestCvSafePalette', () => {
  it('empty → empty', () => {
    expect(suggestCvSafePalette([])).toEqual([]);
  });

  it('single colour → single at H=0', () => {
    const result = suggestCvSafePalette([{ L: 0.6, C: 0.2, H: 45 }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.H).toBe(0);
  });

  it('preserves lightness and chroma from seed', () => {
    const seed: OklchColor[] = [
      { L: 0.3, C: 0.1, H: 0 },
      { L: 0.7, C: 0.25, H: 90 },
    ];
    const result = suggestCvSafePalette(seed);
    expect(result[0]!.L).toBe(0.3);
    expect(result[0]!.C).toBe(0.1);
    expect(result[1]!.L).toBe(0.7);
    expect(result[1]!.C).toBe(0.25);
  });

  it('hue spacing ≥ 30°', () => {
    const seed: OklchColor[] = [
      { L: 0.6, C: 0.2, H: 0 },
      { L: 0.6, C: 0.2, H: 10 },
      { L: 0.6, C: 0.2, H: 20 },
    ];
    const result = suggestCvSafePalette(seed);
    expect(hueSpacingDeg(result)).toBeGreaterThanOrEqual(30);
  });
});

describe('isCvSafePalette', () => {
  it('identical colours are NOT CVD-safe', () => {
    const palette: OklchColor[] = [
      { L: 0.6, C: 0.2, H: 0 },
      { L: 0.6, C: 0.2, H: 5 },
    ];
    expect(isCvSafePalette(palette)).toBe(false);
  });
});
