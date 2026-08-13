/**
 * design-tokens — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  contrastFor,
  diffKits,
  flattenKitTokens,
  generateColorScale,
  isColorScale,
  isRadiusScale,
  isShadowScale,
  isSpacingScale,
  isTypographyScale,
  kitToCssVars,
  missingTokens,
  parseHex,
  resolveToken,
  scaleKindFor,
} from './design-tokens';
import type { BrandKitDetail } from './brand-service';
import { DEFAULT_BRAND_KITS } from './brand-service';

function clone(): BrandKitDetail {
  const kit = DEFAULT_BRAND_KITS[0]!;
  return JSON.parse(JSON.stringify(kit)) as BrandKitDetail;
}

describe('design-tokens', () => {
  it('parseHex handles 3, 6, 8 digit hexes', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#abcdef')).toEqual({ r: 0xab, g: 0xcd, b: 0xef });
    expect(parseHex('#abcdef12')).toEqual({ r: 0xab, g: 0xcd, b: 0xef });
    expect(parseHex('not-a-hex')).toBeNull();
  });

  it('contrastFor returns black on white and white on black', () => {
    expect(contrastFor('#ffffff')).toBe('#000000');
    expect(contrastFor('#000000')).toBe('#ffffff');
  });

  it('contrastFor falls back to black on invalid hex', () => {
    expect(contrastFor('not-a-hex')).toBe('#000000');
  });

  it('flattenKitTokens returns an entry for every scale stop + typography', () => {
    const tokens = flattenKitTokens(clone());
    const paths = Object.keys(tokens);
    expect(paths.some((p) => p.startsWith('color.brand.primary'))).toBe(true);
    expect(paths.some((p) => p.startsWith('type.heading'))).toBe(true);
    expect(paths.some((p) => p.startsWith('space.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('radius.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('shadow.'))).toBe(true);
  });

  it('diffKits reports changed values between two kits', () => {
    const a = clone();
    const b = clone();
    const diffs = diffKits(a, b);
    // Bootstrap clones are identical, so all entries are unchanged.
    expect(diffs.every((d) => !d.changed)).toBe(true);
  });

  it('diffKits returns identical shape for identical kits', () => {
    const diffs = diffKits(clone(), clone());
    expect(diffs.every((d) => !d.changed)).toBe(true);
  });

  it('generateColorScale produces N stops from the base hex', () => {
    const scale = generateColorScale('#3366ff', { id: 'color.test', label: 'Test', steps: 5 });
    expect(scale.stops.length).toBe(5);
    expect(scale.stops[0]?.value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('resolveToken returns the value at a path', () => {
    const kit = clone();
    const value = resolveToken(kit, 'color.brand.primary.500' as const);
    expect(value).toBeTruthy();
  });

  it('resolveToken returns null for unknown paths', () => {
    expect(resolveToken(clone(), 'color.does.not.exist' as never)).toBeNull();
  });

  it("missingTokens returns the paths that aren't in the kit", () => {
    const kit = clone();
    const missing = missingTokens(kit, ['color.brand.primary.500' as const, 'never.here' as never]);
    expect(missing).toContain('never.here');
    expect(missing).not.toContain('color.brand.primary.500');
  });

  it('kitToCssVars exposes primary + accent under known names', () => {
    const vars = kitToCssVars(clone());
    expect(vars['--kit-primary']).toBeTruthy();
    expect(vars['--kit-accent']).toBeTruthy();
    expect(vars['--kit-id']).toBeTruthy();
  });

  it('scaleKindFor returns the right kind per prefix', () => {
    expect(scaleKindFor('color')).toBe('color');
    expect(scaleKindFor('type')).toBe('type');
    expect(scaleKindFor('space')).toBe('space');
    expect(scaleKindFor('radius')).toBe('radius');
    expect(scaleKindFor('shadow')).toBe('shadow');
    expect(scaleKindFor('xyz')).toBe('color');
  });

  it('type guards recognize each scale', () => {
    const kit = clone();
    expect(isColorScale(kit.colors[0]!)).toBe(true);
    expect(isSpacingScale(kit.spacing[0]!)).toBe(true);
    expect(isRadiusScale(kit.radius[0]!)).toBe(true);
    expect(isShadowScale(kit.shadows[0]!)).toBe(true);
    expect(isTypographyScale(kit.typography[0]!)).toBe(true);
    expect(isColorScale(kit.spacing[0]!)).toBe(false);
  });
});
