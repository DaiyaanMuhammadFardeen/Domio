/**
 * Dark / light mode remapping (§3.4).
 *
 * Generation rules (token-by-token in OKLCH):
 *  - Lightness: piecewise perceptual curve
 *      L > 0.95  → 0.18   (bright → dark)
 *      L < 0.05  → 0.85   (dark → bright)
 *      In between: HCT-style smoothstep interpolation.
 *  - Chroma: reduced by 10–20% in dark mode (Helmholtz-Kohlrausch
 *    compensation — saturated colours appear brighter in dark UIs).
 *  - Hue: preserved (drift should be 0°; reported for caller flagging).
 *
 * Brand identity preservation test (§44):
 *  - Hue drift must be ≤ 10°.
 *  - Chroma drift must be ≤ 20%.
 */

import type { OklchColor, RemapResult } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** HCT-style smoothstep: 3t² − 2t³. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Clamp a number to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Dark mode ────────────────────────────────────────────────────────

/**
 * Remap an OKLCH colour from a light theme to a dark theme.
 *
 * @param lch      Source colour in OKLCH (from the light palette).
 * @param chromaFactor  Chroma multiplier (0.80–0.90, default 0.85).
 * @returns        Remapped colour plus drift metrics.
 */
export function remapForDarkMode(
  lch: OklchColor,
  chromaFactor = 0.85,
): RemapResult {
  const L = lch.L;
  let newL: number;

  if (L >= 0.95) {
    newL = 0.18;
  } else if (L <= 0.05) {
    newL = 0.85;
  } else {
    // Normalise into [0,1] within the [0.05, 0.95] band.
    const t = (L - 0.05) / 0.9;
    const s = smoothstep(t);
    // Interpolate: t=0 → 0.85 (dark end), t=1 → 0.18 (light end).
    newL = 0.85 + s * (0.18 - 0.85);
  }

  newL = clamp(newL, 0, 1);

  const newC = clamp(lch.C * chromaFactor, 0, 0.5);
  const newH = lch.H; // preserved

  return {
    value: { L: newL, C: newC, H: newH },
    hueDriftDeg: 0,
    chromaDriftPct: lch.C === 0 ? 0 : Math.abs(newC - lch.C) / lch.C * 100,
  };
}

// ── Light mode ───────────────────────────────────────────────────────

/**
 * Remap an OKLCH colour from a dark theme to a light theme.
 * Inverse of remapForDarkMode — the smoothstep is reversed.
 *
 * @param lch       Source colour in OKLCH (from the dark palette).
 * @param chromaFactor  Chroma multiplier (default 1.0 — no change).
 * @returns         Remapped colour plus drift metrics.
 */
export function remapForLightMode(
  lch: OklchColor,
  chromaFactor = 1.0,
): RemapResult {
  const L = lch.L;
  let newL: number;

  if (L <= 0.05) {
    newL = 0.95;
  } else if (L >= 0.85) {
    newL = 0.05;
  } else {
    // Normalise into [0,1] within the [0.05, 0.85] band.
    const t = (L - 0.05) / 0.8;
    const s = smoothstep(t);
    // Interpolate: t=0 → 0.95 (dark end), t=1 → 0.05 (light end).
    newL = 0.95 + s * (0.05 - 0.95);
  }

  newL = clamp(newL, 0, 1);

  const newC = clamp(lch.C * chromaFactor, 0, 0.5);
  const newH = lch.H; // preserved

  return {
    value: { L: newL, C: newC, H: newH },
    hueDriftDeg: 0,
    chromaDriftPct: lch.C === 0 ? 0 : Math.abs(newC - lch.C) / lch.C * 100,
  };
}
