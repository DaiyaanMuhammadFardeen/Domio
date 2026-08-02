/**
 * Palette helpers for accessibility-aware theming (§3.6, §44, WS-THEME-7 / #44).
 *
 * - hueSpacingDeg: minimum pairwise OKLCH hue distance (wrap-aware).
 * - isCvSafePalette: all pairs distinguishable under CVD simulation.
 * - suggestCvSafePalette: re-seeds hue steps with ≥30° spacing.
 */

import type { OklchColor, CvdType } from './types.js';
import { deltaEOKLCH, oklchToSrgb, srgbToOklch } from './oklch.js';
import { simulateCvd } from './cvd.js';

// ── Hue spacing ──────────────────────────────────────────────────────

/**
 * Minimum pairwise OKLCH hue distance across the palette.
 * Wrap-aware: the distance between 10° and 350° is 20°, not 340°.
 * Returns a value in [0, 180].
 */
export function hueSpacingDeg(palette: OklchColor[]): number {
  if (palette.length < 2) return 180;

  let minDist = 180;
  for (let i = 0; i < palette.length; i++) {
    const h1 = palette[i]!.H;
    for (let j = i + 1; j < palette.length; j++) {
      const h2 = palette[j]!.H;
      const diff = Math.abs(h1 - h2);
      const wrapDist = Math.min(diff, 360 - diff);
      if (wrapDist < minDist) minDist = wrapDist;
    }
  }
  return minDist;
}

// ── CVD safety ───────────────────────────────────────────────────────

/**
 * Check whether every pair of colours in the palette is distinguishable
 * under each of the given CVD simulation types.
 *
 * @param palette  Source palette in OKLCH.
 * @param kinds    CVD types to test (default: deuteranopia, protanopia, tritanopia).
 * @param threshold  Minimum ΔE after simulation (default 10 in OKLab).
 */
export function isCvSafePalette(
  palette: OklchColor[],
  kinds: CvdType[] = ['deuteranopia', 'protanopia', 'tritanopia'],
  threshold = 10,
): boolean {
  for (const kind of kinds) {
    const simulated = palette.map((c) => {
      const rgb = oklchToSrgb(c);
      const simRgb = simulateCvd(rgb, kind);
      return srgbToOklch(simRgb);
    });

    for (let i = 0; i < simulated.length; i++) {
      for (let j = i + 1; j < simulated.length; j++) {
        const a = simulated[i]!;
        const b = simulated[j]!;
        if (deltaEOKLCH(a, b) <= threshold) {
          return false;
        }
      }
    }
  }
  return true;
}

// ── CV-safe palette suggestion ────────────────────────────────────────

/**
 * Re-seed a palette from OKLCH hue steps, enforcing ≥30° hue spacing
 * between adjacent colours (§3.6 / #44 suggestion primitive).
 *
 * Lightness and chroma from the seed are preserved as much as possible.
 * Returns candidate palettes (single solution for now; callers can
 * re-seed with different starting hues for variety).
 */
export function suggestCvSafePalette(seed: OklchColor[]): OklchColor[] {
  if (seed.length === 0) return [];
  if (seed.length === 1) return [{ L: seed[0]!.L, C: seed[0]!.C, H: 0 }];

  // Sort by hue to establish a canonical ordering.
  const sorted = [...seed].sort((a, b) => a.H - b.H);

  const n = sorted.length;
  const minSpacing = 30;
  // Use the larger of 30° and ideal equal spacing.
  const targetSpacing = Math.max(minSpacing, 360 / n);

  const result: OklchColor[] = [];
  // Anchor first colour at its original hue.
  let currentHue = sorted[0]!.H % 360;

  for (let i = 0; i < n; i++) {
    const seed_color = sorted[i]!;
    result.push({
      L: seed_color.L,
      C: seed_color.C,
      H: ((currentHue % 360) + 360) % 360,
    });
    currentHue += targetSpacing;
  }

  return result;
}
