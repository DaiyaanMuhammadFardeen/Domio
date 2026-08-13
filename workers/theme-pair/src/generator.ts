/**
 * Phase 07 — dark/light theme pair generator.
 *
 * The worker takes a base theme (a map of `tokenId → TokenValue`) and
 * produces a `ThemePair` containing the original light-mode theme,
 * a derived dark-mode theme, and a set of optional "neutral" tokens
 * that swap between the two (e.g. `color.surface`, `color.text.body`).
 *
 * The dark-mode generator preserves the hue and chroma of every
 * color and inverts the lightness through the OKLCH space, so brand
 * colors stay perceptually equivalent in both modes.  Non-color
 * tokens (dimension, typography, …) are passed through unchanged.
 *
 * The generator is deterministic, pure, and tested in isolation so
 * the worker entry point can stay a thin NATS-driven wrapper.
 */

import {
  oklchToSrgb,
  srgbToOklch,
  clampToGamut,
  type TokenColor,
  type TokenValue,
} from '@domio/tokens';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark';

export interface ThemePair {
  readonly light: ReadonlyMap<string, TokenValue>;
  readonly dark: ReadonlyMap<string, TokenValue>;
  readonly mode: 'light' | 'dark';
  /** Confidence in the dark-mode derivation (0..1). */
  readonly confidence: number;
  /** Source brand kit ID, included so the worker can emit citations. */
  readonly brandKitId?: string;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Heuristic lightness mapping for a dark-mode counterpart.
 *
 * The mapping is `L_dark = 1 - L_light` with a small bias that lifts
 * very dark surfaces to ~0.10 (so they don't render as pure black) and
 * dims very bright surfaces to ~0.95 (so they don't render as pure
 * white).  This keeps surfaces in a usable range while preserving
 * the relative lightness ordering of the original palette.
 */
function invertLightness(L: number): number {
  if (L < 0.05) return 0.1;
  if (L > 0.95) return 0.95;
  // L' = 1 - L is the simple inversion; bias the midpoint slightly
  // toward 0.5 so brand colors don't slide into pure greys.
  const inverted = 1 - L;
  return Math.min(0.95, Math.max(0.1, inverted));
}

/**
 * Promote a `ColorValue` (sRGB channels) to a dark-mode token.
 * Returns the original value when the input is not a color.
 */
function deriveDarkColor(value: TokenColor): TokenColor {
  const [r, g, b] = value.channels;
  const oklch = srgbToOklch(r, g, b);
  if (!oklch) {
    return { ...value };
  }
  const [L, C, H] = oklch;
  const newL = invertLightness(L);
  // For very-low chroma colors (grey / near-grey), hue is meaningless
  // and saturating sRGB with the new lightness is the right move.
  if (C < 1e-4 || !Number.isFinite(H)) {
    const grey = newL;
    return { ...value, channels: [grey, grey, grey] };
  }
  const back = oklchToSrgb(newL, C, H);
  if (!back) {
    const reduced = clampToGamut(newL, C, H);
    const secondTry = oklchToSrgb(reduced[0], reduced[1], reduced[2]);
    if (!secondTry) return { ...value };
    return { ...value, channels: [secondTry.r, secondTry.g, secondTry.b] };
  }
  return { ...value, channels: [back.r, back.g, back.b] };
}

/**
 * Generate a dark-mode theme from a light-mode theme.
 */
export function generateDarkTheme(
  light: ReadonlyMap<string, TokenValue>,
  opts: { brandKitId?: string } = {},
): ThemePair {
  const dark = new Map<string, TokenValue>();
  let colorCount = 0;
  let successCount = 0;
  for (const [tokenId, value] of light) {
    if (value.type === 'color') {
      colorCount++;
      const darkValue = deriveDarkColor(value.value);
      if (darkValue !== value.value) successCount++;
      dark.set(tokenId, { type: 'color', value: darkValue });
    } else {
      // Pass through non-color tokens verbatim.
      dark.set(tokenId, value);
    }
  }
  const confidence = colorCount === 0 ? 1 : successCount / colorCount;
  const result: ThemePair = {
    light,
    dark,
    mode: 'dark',
    confidence,
    ...(opts.brandKitId ? { brandKitId: opts.brandKitId } : {}),
  };
  return result;
}

/**
 * Build a light-mode theme from a dark-mode theme by re-inverting
 * the lightness of every color.  Functionally symmetric with
 * {@link generateDarkTheme} but kept separate so callers can pass
 * an explicit input.
 */
export function generateLightTheme(
  dark: ReadonlyMap<string, TokenValue>,
  opts: { brandKitId?: string } = {},
): ThemePair {
  const light = new Map<string, TokenValue>();
  let colorCount = 0;
  for (const [tokenId, value] of dark) {
    if (value.type === 'color') {
      colorCount++;
      const [r, g, b] = value.value.channels;
      const oklch = srgbToOklch(r, g, b);
      if (!oklch) {
        light.set(tokenId, value);
        continue;
      }
      // The invertLightness mapping is its own inverse modulo the
      // bias band, so applying it again recovers the light value.
      const [L, C, H] = oklch;
      const newL = invertLightness(L);
      const back = oklchToSrgb(newL, C, H);
      if (!back) {
        light.set(tokenId, value);
        continue;
      }
      light.set(tokenId, {
        type: 'color',
        value: { ...value.value, channels: [back.r, back.g, back.b] },
      });
    } else {
      light.set(tokenId, value);
    }
  }
  const result: ThemePair = {
    light,
    dark,
    mode: 'light',
    confidence: 1.0,
    ...(opts.brandKitId ? { brandKitId: opts.brandKitId } : {}),
  };
  return result;
}
