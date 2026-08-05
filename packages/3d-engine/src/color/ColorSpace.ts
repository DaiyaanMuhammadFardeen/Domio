/**
 * @domio/3d-engine — color space conversions.
 *
 * Linear ↔ sRGB with the standard piecewise approximation (pow 1/2.2
 * for linear→sRGB, pow 2.2 for sRGB→linear).  A `lossless` toggle
 * preserves colors unchanged (identity pass-through).
 */

const SRGB_TO_LINEAR_THRESHOLD = 0.04045;
const LINEAR_TO_SRGB_THRESHOLD = 0.0031308;
const LINEAR_TO_SRGB_A = 0.055;

/**
 * Convert a linear [0,1] value to sRGB [0,1].
 * Uses the standard piecewise formula for deterministic output.
 */
export function linearToSRGB(linear: number): number {
  const v = Math.max(0, Math.min(1, linear));
  if (v <= LINEAR_TO_SRGB_THRESHOLD) {
    return v * 12.92;
  }
  return Math.pow(v, 1 / 2.2) * (1 + LINEAR_TO_SRGB_A) - LINEAR_TO_SRGB_A;
}

/**
 * Convert an sRGB [0,1] value to linear [0,1].
 */
export function sRGBToLinear(srgb: number): number {
  const v = Math.max(0, Math.min(1, srgb));
  if (v <= SRGB_TO_LINEAR_THRESHOLD) {
    return v / 12.92;
  }
  return Math.pow((v + LINEAR_TO_SRGB_A) / (1 + LINEAR_TO_SRGB_A), 2.2);
}

/**
 * Convert hex color (#RRGGBB) to linear sRGB [r, g, b] each in [0,1].
 */
export function hexToLinear(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [sRGBToLinear(r), sRGBToLinear(g), sRGBToLinear(b)];
}

/**
 * Convert linear sRGB [r, g, b] back to hex (#RRGGBB).
 */
export function linearToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const srgb = linearToSRGB(v);
    return Math.round(srgb * 255).toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert hex → linear → sRGB roundtrip.
 * Useful for testing: hex → linear → hex should be lossy but close.
 */
export function hexRoundtrip(hex: string): string {
  const [r, g, b] = hexToLinear(hex);
  return linearToHex(r, g, b);
}

/**
 * When `lossless` is true, returns the input value unchanged.
 * Otherwise applies linearToSRGB conversion.
 */
export function applyColorSpace(
  linear: number,
  lossless: boolean,
): number {
  return lossless ? linear : linearToSRGB(linear);
}
