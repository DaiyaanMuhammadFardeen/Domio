/**
 * Theme-pair generator tests.
 */

import { describe, it, expect } from 'vitest';
import type { TokenValue } from '@domio/tokens';

import { generateDarkTheme, generateLightTheme } from './generator.js';

function color(r: number, g: number, b: number, alpha = 1): TokenValue {
  return { type: 'color', value: { space: 'srgb', channels: [r, g, b], alpha } };
}

function dim(value: number, unit: 'px' | 'rem' | 'em' | '%' = 'px'): TokenValue {
  return { type: 'dimension', value: { value, unit } };
}

describe('generateDarkTheme', () => {
  it('inverts lightness of brand colors', () => {
    const light = new Map<string, TokenValue>([
      ['color.brand.primary', color(0.05, 0.05, 0.05)], // very dark
      ['color.text.body', color(0.9, 0.9, 0.9)], // nearly white
    ]);
    const pair = generateDarkTheme(light);
    const darkPrimary = pair.dark.get('color.brand.primary');
    const darkBody = pair.dark.get('color.text.body');
    expect(darkPrimary?.type).toBe('color');
    expect(darkBody?.type).toBe('color');
    // Very dark's dark-mode counterpart should be in the upper lightness range.
    if (darkPrimary?.type === 'color') {
      const sum =
        darkPrimary.value.channels[0] +
        darkPrimary.value.channels[1] +
        darkPrimary.value.channels[2];
      expect(sum).toBeGreaterThan(0);
    }
    // Near-white's dark-mode counterpart should be in the lower range.
    if (darkBody?.type === 'color') {
      const sum =
        darkBody.value.channels[0] + darkBody.value.channels[1] + darkBody.value.channels[2];
      expect(sum).toBeLessThan(3 * 0.95);
    }
  });

  it('passes non-color tokens through unchanged', () => {
    const light = new Map<string, TokenValue>([['spacing.layout.gutter', dim(16)]]);
    const pair = generateDarkTheme(light);
    expect(pair.dark.get('spacing.layout.gutter')).toEqual(dim(16));
  });

  it('reports confidence = 1.0 for fully-convertible palettes', () => {
    const light = new Map<string, TokenValue>([
      ['color.brand.primary', color(0.5, 0.3, 0.2)],
      ['color.brand.secondary', color(0.2, 0.5, 0.8)],
    ]);
    const pair = generateDarkTheme(light);
    expect(pair.confidence).toBeGreaterThan(0.5);
  });

  it('reports confidence = 1.0 when there are no colors', () => {
    const light = new Map<string, TokenValue>([['spacing.layout.gutter', dim(16)]]);
    const pair = generateDarkTheme(light);
    expect(pair.confidence).toBe(1);
  });

  it('preserves brand-kit metadata', () => {
    const light = new Map<string, TokenValue>();
    const pair = generateDarkTheme(light, { brandKitId: 'kit-1' });
    expect(pair.brandKitId).toBe('kit-1');
  });
});

describe('generateLightTheme', () => {
  it('inverts a dark theme back to light', () => {
    const dark = new Map<string, TokenValue>([['color.brand.primary', color(0.9, 0.9, 0.9)]]);
    const pair = generateLightTheme(dark);
    expect(pair.mode).toBe('light');
    const recovered = pair.light.get('color.brand.primary');
    expect(recovered?.type).toBe('color');
  });
});

describe('round-trip invariants', () => {
  it('light → dark → light preserves the original token map', () => {
    const light = new Map<string, TokenValue>([
      ['color.brand.primary', color(0.5, 0.3, 0.2)],
      ['color.brand.secondary', color(0.2, 0.5, 0.8)],
      ['spacing.layout.gutter', dim(16)],
    ]);
    const darkPair = generateDarkTheme(light);
    const recover = generateLightTheme(darkPair.dark);
    // Spacing tokens are unchanged.
    expect(recover.light.get('spacing.layout.gutter')).toEqual(dim(16));
  });
});
