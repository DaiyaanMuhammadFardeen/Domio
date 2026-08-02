/**
 * OKLCH color-space conversions.
 *
 * References:
 * - Björn Ottosson, "A perceptual color space for image processing",
 *   https://oklch.com
 * - Oklab/OklCH constants from Ottosson's implementation:
 *   https://github.com/bottosson/colorscience
 */

import type { SrgbColor, OklchColor, LinearSrgb } from './types.js';

// ── sRGB ↔ Linear sRGB ──────────────────────────────────────────────

/** Decode a single sRGB channel [0..1] to linear. */
function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Encode a single linear channel [0..1] to sRGB. */
function linearToSrgbChannel(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/** Convert sRGB to linear sRGB. */
export function srgbToLinear(rgb: SrgbColor): LinearSrgb {
  return {
    r: srgbToLinearChannel(rgb.r),
    g: srgbToLinearChannel(rgb.g),
    b: srgbToLinearChannel(rgb.b),
  };
}

/** Convert linear sRGB to sRGB. */
export function linearToSrgb(lin: LinearSrgb): SrgbColor {
  return {
    r: linearToSrgbChannel(lin.r),
    g: linearToSrgbChannel(lin.g),
    b: linearToSrgbChannel(lin.b),
  };
}

// ── Linear sRGB ↔ OKLab (via LMS) ────────────────────────────────────

/** Linear sRGB → OKLab (via LMS intermediary, Ottosson's constants). */
export function linearToOklab(lin: LinearSrgb): { L: number; a: number; b: number } {
  // sRGB → LMS (Ottosson matrix)
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

  // cube root
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  // LMS → OKLab
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return { L, a, b };
}

/** OKLab → linear sRGB (reverse Ottosson transform). */
export function oklabToLinear(Lab: { L: number; a: number; b: number }): LinearSrgb {
  // OKLab → LMS (cube-rooted)
  const l_ = Lab.L + 0.3963377774 * Lab.a + 0.2158037573 * Lab.b;
  const m_ = Lab.L - 0.1055613458 * Lab.a - 0.0638541728 * Lab.b;
  const s_ = Lab.L - 0.0894841775 * Lab.a - 1.2914855480 * Lab.b;

  // undo cube root
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return { r, g, b };
}

// ── OKLab ↔ OKLCH (polar) ───────────────────────────────────────────

/** OKLab → OKLCH. H is in degrees [0..360). */
export function oklabToOklch(Lab: { L: number; a: number; b: number }): OklchColor {
  const C = Math.sqrt(Lab.a * Lab.a + Lab.b * Lab.b);
  let H = (Math.atan2(Lab.b, Lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  if (C < 1e-10) H = 0; // achromatic → convention H=0
  return { L: Lab.L, C, H };
}

/** OKLCH → OKLab. */
export function oklchToOklab(lch: OklchColor): { L: number; a: number; b: number } {
  const rad = (lch.H * Math.PI) / 180;
  return {
    L: lch.L,
    a: lch.C * Math.cos(rad),
    b: lch.C * Math.sin(rad),
  };
}

// ── High-level: sRGB ↔ OKLCH ─────────────────────────────────────────

/** sRGB → OKLCH (channels in [0,1]). */
export function srgbToOklch(rgb: SrgbColor): OklchColor {
  const lin = srgbToLinear(rgb);
  const Lab = linearToOklab(lin);
  return oklabToOklch(Lab);
}

/** OKLCH → sRGB (channels clamped to [0,1]). */
export function oklchToSrgb(lch: OklchColor): SrgbColor {
  const Lab = oklchToOklab(lch);
  const lin = oklabToLinear(Lab);
  return linearToSrgb(lin);
}

// ── Hex helpers ──────────────────────────────────────────────────────

/** Parse "#RGB" or "#RRGGBB" (case-insensitive) to sRGB [0,1]. */
export function hexToRgb(hex: string): SrgbColor {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

/** sRGB [0,1] → "#RRGGBB" (lowercase). */
export function rgbToHex(rgb: SrgbColor): string {
  const toHex = (v: number): string => {
    const clamped = Math.max(0, Math.min(1, v));
    const n = Math.round(clamped * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

// ── ΔE in OKLab (Euclidean distance) ────────────────────────────────

/** Compute ΔE between two OKLCH colors (Euclidean distance in OKLab). */
export function deltaEOKLCH(a: OklchColor, b: OklchColor): number {
  const a1 = a.C * Math.cos((a.H * Math.PI) / 180);
  const b1 = a.C * Math.sin((a.H * Math.PI) / 180);
  const a2 = b.C * Math.cos((b.H * Math.PI) / 180);
  const b2 = b.C * Math.sin((b.H * Math.PI) / 180);
  const dL = a.L - b.L;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
}
