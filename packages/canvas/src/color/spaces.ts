/**
 * Color spaces — sRGB / Display P3 round-trip and delta-E warning. See
 * docs/development_phases/phase-03 §D.2.
 */

export type ColorSpaceName = 'srgb' | 'display-p3';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface DisplayP3 extends Rgb {}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const value = m[1]!;
  if (value.length === 3) {
    return {
      r: parseInt(value[0]! + value[0]!, 16) / 255,
      g: parseInt(value[1]! + value[1]!, 16) / 255,
      b: parseInt(value[2]! + value[2]!, 16) / 255,
    };
  }
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

export function rgbToHex(rgb: Rgb): string {
  const r = Math.max(0, Math.min(255, Math.round(rgb.r * 255)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g * 255)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b * 255)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Approximate sRGB → linear → Display-P3 conversion. Returns the linear
 * sRGB triplet encoded for the P3 working color space.
 */
export function srgbToDisplayP3(rgb: Rgb): DisplayP3 {
  return {
    r: Math.pow(rgb.r, 2.2),
    g: Math.pow(rgb.g, 2.2),
    b: Math.pow(rgb.b, 2.2),
  };
}

export function displayP3ToSrgb(p3: DisplayP3): Rgb {
  return {
    r: Math.pow(p3.r, 1 / 2.2),
    g: Math.pow(p3.g, 1 / 2.2),
    b: Math.pow(p3.b, 1 / 2.2),
  };
}

/**
 * Approximate CIE76 Δ-E. Returns a number; values above ~2.3 are typically
 * "noticeable" by trained eyes. Used for the out-of-palette warning.
 */
export function deltaE(a: Rgb, b: Rgb): number {
  const labA = rgbToLab(a);
  const labB = rgbToLab(b);
  return Math.sqrt(
    (labA.L - labB.L) ** 2 +
    (labA.a - labB.a) ** 2 +
    (labA.b - labB.b) ** 2,
  );
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

function rgbToLab(rgb: Rgb): Lab {
  const linear = { r: rgb.r, g: rgb.g, b: rgb.b };
  const x = linear.r * 0.4124 + linear.g * 0.3576 + linear.b * 0.1805;
  const y = linear.r * 0.2126 + linear.g * 0.7152 + linear.b * 0.0722;
  const z = linear.r * 0.0193 + linear.g * 0.1192 + linear.b * 0.9505;
  const fx = pivotX(x);
  const fy = pivotY(y);
  const fz = pivotZ(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function pivotX(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}
function pivotY(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}
function pivotZ(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}