/**
 * Centroid axis computation for exploded-view animations.
 *
 * Each part's centroid is derived from its axis-aligned bounding box.
 * The centroid axis is the direction from the scene origin to the
 * centroid, which parts animate outward along during an explode.
 */

import type { Vec3, ModelMesh } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface CentroidResult {
  /** Center of the bounding box (centroid position). */
  center: Vec3;
  /** Unit direction from scene origin toward the centroid. */
  axis: Vec3;
  /** True if the mesh is convex (default assumption). */
  isConvex: boolean;
}

export interface ExplodeKeyframe {
  /** Normalised time [0, 1]. */
  t: number;
  /** Position offset along the axis. */
  offset: Vec3;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ---------------------------------------------------------------------------
// CentroidAxis
// ---------------------------------------------------------------------------

/**
 * Compute the centroid and centroid axis from a mesh's bounding box.
 */
export function computeCentroid(mesh: ModelMesh): CentroidResult {
  const center: Vec3 = {
    x: (mesh.bounds.min.x + mesh.bounds.max.x) / 2,
    y: (mesh.bounds.min.y + mesh.bounds.max.y) / 2,
    z: (mesh.bounds.min.z + mesh.bounds.max.z) / 2,
  };
  const axis = vec3Normalize(center);
  return { center, axis, isConvex: true };
}

/**
 * Compute centroids for multiple parts.
 */
export function computePartCentroids(parts: ModelMesh[]): CentroidResult[] {
  return parts.map((p) => computeCentroid(p));
}

/**
 * Ease-out cubic:  1 - (1 - t)^3
 */
export function outCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/**
 * Generate explode keyframes for a part.
 *
 * @param centroid - The part's centroid result
 * @param distance - Total explode distance along the axis
 * @param durationMs - Animation duration (default 600 ms)
 * @param fps - Frames per second (default 60)
 * @param overrideEasing - Optional per-part easing override
 * @returns Array of keyframes at the given fps
 */
export function generateExplodeKeyframes(
  centroid: CentroidResult,
  distance: number,
  durationMs = 600,
  fps = 60,
  overrideEasing?: (t: number) => number,
): ExplodeKeyframe[] {
  const easing = overrideEasing ?? outCubic;
  const totalFrames = Math.round((durationMs / 1000) * fps);
  const keyframes: ExplodeKeyframe[] = [];

  for (let i = 0; i <= totalFrames; i++) {
    const t = i / Math.max(totalFrames, 1);
    const eased = easing(t);
    keyframes.push({
      t,
      offset: vec3Scale(centroid.axis, distance * eased),
    });
  }

  return keyframes;
}
