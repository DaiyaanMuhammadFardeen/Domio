/**
 * Color-vision-deficiency (CVD) simulation.
 *
 * Simulation matrices from:
 *   - Brettel / Vienot / Mollon (1997) — dichromacy matrices for
 *     deuteranopia, protanopia, tritanopia (severity = 1.0).
 *   - Machado / Oliveira / Fernandes (2009) — severity interpolation
 *     via linear blend: M(s) = (1-s)·I + s·M_full.
 *
 * For anomalous trichromacy (deuteranomaly, protanomaly, tritanomaly)
 * we use severity = 0.6.
 *
 * Per §3.6: "transformed in OKLCH to preserve perceived lightness."
 * The simulation itself operates on linear sRGB (where the matrices
 * are defined); the caller converts the result to OKLCH for ΔE
 * comparison, which preserves perceptual lightness gradients.
 */

import type { SrgbColor, CvdType, LinearSrgb } from './types.js';
import { srgbToLinear, linearToSrgb } from './oklch.js';

// ── 3×3 matrix type ──────────────────────────────────────────────────

type Mat3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// ── Brettel / Vienot / Mollon dichromacy matrices (severity = 1.0) ──

/** Deuteranopia (M = 1.0). */
export const DEUTERANOPIA_MATRIX: Mat3 = [
  [0.431864902, 0.735493085, -0.167357984],
  [0.106337762, 0.856589968, 0.03707233],
  [0.015701805, 0.114720203, 0.869577992],
];

/** Protanopia (M = 1.0). */
export const PROTANOPIA_MATRIX: Mat3 = [
  [0.152593845, 1.052258217, -0.204852062],
  [0.114985733, 0.786691839, 0.098322428],
  [-0.003885416, 0.05498658, 0.948898836],
];

/** Tritanopia (M = 1.0). */
export const TRITANOPIA_MATRIX: Mat3 = [
  [1.255876775, -0.076944824, -0.178931951],
  [-0.078372535, 0.930487073, 0.147885462],
  [0.004731298, 0.691427763, 0.303840939],
];

// ── Severity-interpolated matrices ───────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpMatrix(a: Mat3, b: Mat3, t: number): Mat3 {
  return [
    [lerp(a[0][0], b[0][0], t), lerp(a[0][1], b[0][1], t), lerp(a[0][2], b[0][2], t)],
    [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)],
    [lerp(a[2][0], b[2][0], t), lerp(a[2][1], b[2][1], t), lerp(a[2][2], b[2][2], t)],
  ];
}

/** Full-severity dichromacy matrix for a given CVD type. */
function fullMatrix(kind: CvdType): Mat3 {
  switch (kind) {
    case 'deuteranopia':
    case 'deuteranomaly':
      return DEUTERANOPIA_MATRIX;
    case 'protanopia':
    case 'protanomaly':
      return PROTANOPIA_MATRIX;
    case 'tritanopia':
    case 'tritanomaly':
      return TRITANOPIA_MATRIX;
  }
}

/** Severity for anomalous trichromacy types. */
function severity(kind: CvdType): number {
  switch (kind) {
    case 'deuteranopia':
    case 'protanopia':
    case 'tritanopia':
      return 1.0;
    case 'deuteranomaly':
    case 'protanomaly':
    case 'tritanomaly':
      return 0.6;
  }
}

/** Interpolated CVD simulation matrix for the given type and severity. */
export function cvdMatrix(kind: CvdType): Mat3 {
  const s = severity(kind);
  const full = fullMatrix(kind);
  return lerpMatrix(IDENTITY, full, s);
}

// ── Simulation ────────────────────────────────────────────────────────

function mat3Vec(m: Mat3, v: readonly [number, number, number]): LinearSrgb {
  return {
    r: m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    g: m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    b: m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  };
}

/** Simulate how `rgb` appears under the given CVD type. Returns sRGB [0,1]. */
export function simulateCvd(rgb: SrgbColor, kind: CvdType): SrgbColor {
  const lin = srgbToLinear(rgb);
  const mat = cvdMatrix(kind);
  const simLin = mat3Vec(mat, [lin.r, lin.g, lin.b]);
  // Clamp to [0,1] before inverse-linearise (out-of-gamut can happen).
  return linearToSrgb({
    r: Math.max(0, Math.min(1, simLin.r)),
    g: Math.max(0, Math.min(1, simLin.g)),
    b: Math.max(0, Math.min(1, simLin.b)),
  });
}

// ── Palette export (all 6 matrices) ──────────────────────────────────

/** All 6 CVD simulation matrices keyed by type. */
export const CVD_MATRICES: Record<CvdType, Mat3> = {
  deuteranopia: DEUTERANOPIA_MATRIX,
  protanopia: PROTANOPIA_MATRIX,
  tritanopia: TRITANOPIA_MATRIX,
  deuteranomaly: lerpMatrix(IDENTITY, DEUTERANOPIA_MATRIX, 0.6),
  protanomaly: lerpMatrix(IDENTITY, PROTANOPIA_MATRIX, 0.6),
  tritanomaly: lerpMatrix(IDENTITY, TRITANOPIA_MATRIX, 0.6),
};
