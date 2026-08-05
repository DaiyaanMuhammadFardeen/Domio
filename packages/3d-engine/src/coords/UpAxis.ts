/**
 * @domio/3d-engine — up-axis handling.
 *
 * Y-up is the default. Z-up assets get an auto-rotate quaternion to Y-up
 * via the `up_axis` hint. Manual override flag wins.
 */

import type { Quat } from '../contracts/renderer.v1.js';

export interface UpAxisConfig {
  /** Declared up axis of the source asset. Default: 'y-up'. */
  upAxis: 'y-up' | 'z-up';
  /** When true, the auto-rotation is bypassed and the asset is used as-is. */
  manualOverride?: boolean;
}

/** Identity quaternion (no rotation). */
const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Compute the rotation quaternion needed to convert from the asset's
 * up-axis to Y-up.  Returns identity when no rotation is needed.
 *
 * - Y-up → identity (no rotation needed).
 * - Z-up → 90° rotation around X axis: quat from axis-angle (1,0,0) × π/2.
 */
export function getUpAxisRotation(config: UpAxisConfig): Quat {
  if (config.manualOverride) return IDENTITY_QUAT;
  if (config.upAxis === 'y-up') return IDENTITY_QUAT;

  // Z-up → Y-up: rotate -90° around X axis.
  // axis = (1, 0, 0), angle = -π/2
  // q = (sin(θ/2) * axis, cos(θ/2))
  // θ = -π/2 → θ/2 = -π/4
  // sin(-π/4) = -√2/2 ≈ -0.7071
  // cos(-π/4) =  √2/2 ≈  0.7071
  const halfAngle = -Math.PI / 4;
  const s = Math.sin(halfAngle);
  return {
    x: s, // axis.x * sin(halfAngle)
    y: 0, // axis.y * sin(halfAngle)
    z: 0, // axis.z * sin(halfAngle)
    w: Math.cos(halfAngle),
  };
}

/**
 * Determine if a rotation is needed (i.e. not identity).
 */
export function needsUpAxisConversion(config: UpAxisConfig): boolean {
  if (config.manualOverride) return false;
  return config.upAxis === 'z-up';
}
