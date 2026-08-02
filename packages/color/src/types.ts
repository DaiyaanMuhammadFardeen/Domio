/** sRGB color with channels in [0,1]. */
export interface SrgbColor {
  r: number;
  g: number;
  b: number;
}

/** OKLCH color: L ∈ [0,1], C ≥ 0, H ∈ [0,360) degrees. */
export interface OklchColor {
  L: number;
  C: number;
  H: number;
}

/** Linear sRGB channels (gamma-decoded). */
export interface LinearSrgb {
  r: number;
  g: number;
  b: number;
}

/** CVD simulation type. */
export type CvdType =
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia'
  | 'deuteranomaly'
  | 'protanomaly'
  | 'tritanomaly';

/** Result of a dark/light mode remap. */
export interface RemapResult {
  value: OklchColor;
  hueDriftDeg: number;
  chromaDriftPct: number;
}
