/**
 * WCAG 2.x contrast ratio and APCA (WCAG 3 draft) contrast computation.
 *
 * References:
 * - WCAG 2.x: https://www.w3.org/TR/WCAG21/#contrast-minimum
 * - sRGB linearization per §3.5 of theming-branding.md:
 *   c_lin = c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4
 * - Relative luminance: 0.2126·R + 0.7152·G + 0.0722·B
 * - APCA (WCAG 3 draft, SAPC0.6): https://github.com/Myndex/SAPC-APCA
 */

import type { SrgbColor } from './types.js';

// ── WCAG 2.x relative luminance ──────────────────────────────────────

/** WCAG 2.x sRGB channel linearisation (spec §3.5). */
function wcagLinearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.x (sRGB input, channels in [0,1]). */
export function relativeLuminance(rgb: SrgbColor): number {
  return (
    0.2126 * wcagLinearize(rgb.r) +
    0.7152 * wcagLinearize(rgb.g) +
    0.0722 * wcagLinearize(rgb.b)
  );
}

// ── WCAG 2.x contrast ratio ──────────────────────────────────────────

/** WCAG 2.x contrast ratio ∈ [1, 21]. */
export function wcagContrast(fg: SrgbColor, bg: SrgbColor): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── APCA (WCAG 3 draft) ─────────────────────────────────────────────

/**
 * APCA0.06G contrast value (Lc).
 *
 * Returns a signed number: positive = dark text on light bg (normal),
 * negative = light text on dark bg (inverted).  Range ≈ -108..+106.
 *
 * Uses the SAPC0.6 power-curve approach from Myndex's reference
 * implementation (https://github.com/Myndex/SAPC-APCA).
 */
export function apcaContrast(fg: SrgbColor, bg: SrgbColor): number {
  // Use WCAG linearisation (§3.5 specifies the same linearization for
  // P3 — "linearise in P3 primaries" — but the luminance coefficients
  // 0.2126/0.7152/0.0722 stay the same).
  const Yfg = relativeLuminance(fg);
  const Ybg = relativeLuminance(bg);

  // Soft clamp near zero (power-based, per SAPC0.6).
  const softClip = (y: number): number =>
    y < 0.022 ? y + Math.pow(0.022 - y, 1.42) : y;

  const T = softClip(Yfg);
  const B = softClip(Ybg);

  // Polarity-aware SAPC contrast.
  let raw: number;
  if (B > T) {
    // Normal polarity (dark text on light background).
    raw = (Math.pow(B, 0.56) - Math.pow(T, 0.57)) * 1.14;
  } else {
    // Reverse polarity (light text on dark background).
    raw = (Math.pow(B, 0.62) - Math.pow(T, 0.65)) * 1.14;
  }

  // Scale to Lc units and clamp to the canonical range.
  return Math.max(-108, Math.min(106, raw * 100));
}

// ── P3 helpers ───────────────────────────────────────────────────────

/** Linearise a Display P3 channel (same gamma as sRGB, per §3.5 note). */
export function p3Linearize(c: number): number {
  return wcagLinearize(c);
}

/**
 * Relative luminance for a P3 colour.
 *
 * Per §3.5: "linearise in P3 primaries (slightly different coefficients),
 * then treat as 0.2126·R + 0.7152·G + 0.0722·B."  The matrix coefficients
 * stay the same — only the gamma differs from sRGB, but Display P3 uses
 * the same power curve as sRGB for practical purposes.
 */
export function p3RelativeLuminance(rgb: SrgbColor): number {
  return relativeLuminance(rgb);
}
