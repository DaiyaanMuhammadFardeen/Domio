/**
 * @domio/3d-engine — unit scale helper.
 *
 * Converts between source model units and a target unit system.
 * Common cases: meters (default), centimeters, millimeters, inches.
 */

export type UnitSystem = 'meters' | 'centimeters' | 'millimeters' | 'inches';

/** Conversion factors to meters (multiply source value by this to get meters). */
const TO_METERS: Record<UnitSystem, number> = {
  meters: 1.0,
  centimeters: 0.01,
  millimeters: 0.001,
  inches: 0.0254,
};

/**
 * Get the scale factor to convert from `source` to `target` unit system.
 *
 * @example
 * // 100 cm → 1 m
 * getUnitScale('centimeters', 'meters') → 0.01
 */
export function getUnitScale(source: UnitSystem, target: UnitSystem): number {
  const sourceToMeters = TO_METERS[source];
  const targetToMeters = TO_METERS[target];
  return sourceToMeters / targetToMeters;
}

/**
 * Apply unit conversion to a numeric value.
 */
export function convertUnits(
  value: number,
  source: UnitSystem,
  target: UnitSystem,
): number {
  return value * getUnitScale(source, target);
}

/**
 * Apply unit conversion to a Vec3-like object.
 */
export function convertUnitsVec3(
  v: { x: number; y: number; z: number },
  source: UnitSystem,
  target: UnitSystem,
): { x: number; y: number; z: number } {
  const scale = getUnitScale(source, target);
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}
