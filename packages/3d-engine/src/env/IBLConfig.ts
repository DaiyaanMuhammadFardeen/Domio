/**
 * @domio/3d-engine — Image-Based Lighting configuration.
 */

export interface IBLConfig {
  /** Whether IBL is enabled. */
  enabled: boolean;
  /** Environment map intensity multiplier (clamped ≥ 0). */
  intensity: number;
  /** Environment map rotation in degrees (0–360). */
  rotationDeg: number;
}

/** Default IBL configuration. */
export const DEFAULT_IBL_CONFIG: IBLConfig = {
  enabled: true,
  intensity: 1.0,
  rotationDeg: 0,
};

/**
 * Create an IBL config with validation.
 * Intensity is clamped ≥ 0; rotation is wrapped to [0, 360).
 */
export function createIBLConfig(partial?: Partial<IBLConfig>): IBLConfig {
  const base = { ...DEFAULT_IBL_CONFIG, ...partial };
  return {
    enabled: base.enabled,
    intensity: Math.max(0, base.intensity),
    rotationDeg: ((base.rotationDeg % 360) + 360) % 360,
  };
}

/**
 * Apply rotation to a direction vector (around Y axis).
 * Returns a new {x, y, z} with the rotation applied.
 */
export function applyRotation(
  dir: { x: number; y: number; z: number },
  rotationDeg: number,
): { x: number; y: number; z: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: dir.x * cos + dir.z * sin,
    y: dir.y,
    z: -dir.x * sin + dir.z * cos,
  };
}
