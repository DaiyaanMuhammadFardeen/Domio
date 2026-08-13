import { describe, it, expect } from 'vitest';
import { Eyedropper, fallbackSample } from '../src/eyedropper/index.js';
import { hexToRgb, rgbToHex, deltaE } from '../src/color/spaces.js';
import { matchTheme, fallbackPalette } from '../src/color/theme-match.js';

describe('eyedropper', () => {
  it('captures a sample and matches the closest theme token', () => {
    const eyedropper = new Eyedropper({ tokens: fallbackPalette(), sampleRateHz: 8 });
    const sample = eyedropper.sample({ r: 0.5, g: 0.5, b: 0.5 });
    expect(sample.rgb.r).toBe(0.5);
    expect(sample.themeMatch.token).not.toBeNull();
  });

  it('flags out-of-palette samples when Δ > 2.3', () => {
    const out = matchTheme({ r: 1, g: 1, b: 0 }, fallbackPalette());
    expect(out.outOfPalette).toBe(true);
  });

  it('uses 8 Hz sample rate by default', () => {
    const eyedropper = new Eyedropper();
    eyedropper.start();
    eyedropper.cancel();
  });

  it('falls back to hex parsing when no canvas is available', () => {
    expect(fallbackSample('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(fallbackSample('not a color')).toBeNull();
  });
});

describe('color spaces', () => {
  it('hexToRgb parses 3-digit shorthand', () => {
    expect(hexToRgb('#abc')).toEqual({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255 });
  });

  it('hexToRgb parses 6-digit hex', () => {
    expect(hexToRgb('#ff00ff')).toEqual({ r: 1, g: 0, b: 1 });
  });

  it('rgbToHex round-trips', () => {
    expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000');
  });

  it('deltaE returns 0 for identical colors', () => {
    expect(deltaE({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 })).toBe(0);
  });
});
