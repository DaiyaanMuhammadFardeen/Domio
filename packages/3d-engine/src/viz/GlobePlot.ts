/**
 * Globe plot — lat/lon → 3D unit-sphere projection.
 *
 * Converts geographic coordinates to positions on a unit sphere for
 * rendering a 3D globe visualization.
 */

import type { Vec3, LODSelection } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface GlobePoint {
  lat: number;
  lon: number;
  value?: number;
  label?: string;
}

export interface GlobeArc {
  from: GlobePoint;
  to: GlobePoint;
  color?: string;
}

export interface GlobeResult {
  positions: Vec3[];
  /** LOD-scaled instance count. */
  instanceCount: number;
  lod: LODSelection;
}

// ---------------------------------------------------------------------------
// Projection math
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert lat/lon (degrees) to a unit-sphere position.
 *
 * Convention:
 * - latitude: -90 (south pole) to +90 (north pole)
 * - longitude: -180 to +180
 * - Result: x = cos(lat) * cos(lon), y = cos(lat) * sin(lon), z = sin(lat)
 */
export function latLonToUnitSphere(lat: number, lon: number): Vec3 {
  const latRad = lat * DEG_TO_RAD;
  const lonRad = lon * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad),
  };
}

/**
 * Interpolate between two lat/lon points along a great-circle arc.
 */
export function interpolateArc(
  from: GlobePoint,
  to: GlobePoint,
  t: number,
): Vec3 {
  const a = latLonToUnitSphere(from.lat, from.lon);
  const b = latLonToUnitSphere(to.lat, to.lon);
  // Linear interpolation on the sphere surface (good enough for viz)
  const ix = a.x + (b.x - a.x) * t;
  const iy = a.y + (b.y - a.y) * t;
  const iz = a.z + (b.z - a.z) * t;
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: ix / len, y: iy / len, z: iz / len };
}

// ---------------------------------------------------------------------------
// LOD scaling
// ---------------------------------------------------------------------------

function lodScale(level: LODSelection['level']): number {
  switch (level) {
    case 0: return 1.0;
    case 1: return 0.5;
    case 2: return 0.25;
    case 3: return 0.125;
  }
}

// ---------------------------------------------------------------------------
// GlobePlot
// ---------------------------------------------------------------------------

/**
 * Generate positioned primitives for a globe plot.
 * LOD scales the number of rendered instances.
 */
export function generateGlobe(
  points: GlobePoint[],
  lod: LODSelection,
): GlobeResult {
  const scale = lodScale(lod.level);
  const positions: Vec3[] = [];
  for (const p of points) {
    positions.push(latLonToUnitSphere(p.lat, p.lon));
  }
  return {
    positions,
    instanceCount: Math.round(positions.length * scale),
    lod,
  };
}

/**
 * Generate arc segment positions between two points.
 */
export function generateArc(
  arc: GlobeArc,
  segments: number,
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(interpolateArc(arc.from, arc.to, i / segments));
  }
  return pts;
}
