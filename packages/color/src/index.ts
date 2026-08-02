/**
 * @domio/color — Color math for Domio theming.
 *
 * OKLCH / sRGB / P3 conversions, ΔE, WCAG + APCA contrast,
 * and colorblind (CVD) simulation.
 */

// ── Types ────────────────────────────────────────────────────────────
export type { SrgbColor, OklchColor, LinearSrgb, CvdType, RemapResult } from './types.js';

// ── OKLCH conversions ────────────────────────────────────────────────
export {
  srgbToLinear,
  linearToSrgb,
  linearToOklab,
  oklabToLinear,
  oklabToOklch,
  oklchToOklab,
  srgbToOklch,
  oklchToSrgb,
  hexToRgb,
  rgbToHex,
  deltaEOKLCH,
} from './oklch.js';

// ── Contrast ─────────────────────────────────────────────────────────
export {
  relativeLuminance,
  wcagContrast,
  apcaContrast,
  p3Linearize,
  p3RelativeLuminance,
} from './contrast.js';

// ── CVD simulation ───────────────────────────────────────────────────
export {
  DEUTERANOPIA_MATRIX,
  PROTANOPIA_MATRIX,
  TRITANOPIA_MATRIX,
  CVD_MATRICES,
  cvdMatrix,
  simulateCvd,
} from './cvd.js';

// ── Palette helpers ──────────────────────────────────────────────────
export {
  hueSpacingDeg,
  isCvSafePalette,
  suggestCvSafePalette,
} from './palette.js';

// ── Dark / light remapping ───────────────────────────────────────────
export {
  remapForDarkMode,
  remapForLightMode,
} from './remap.js';
