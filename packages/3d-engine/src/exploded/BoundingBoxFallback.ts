/**
 * Bounding-box fallback for non-convex parts.
 *
 * When a mesh part is detected as non-convex, the centroid calculation
 * falls back to the bounding-box center.  A flag is returned so the
 * caller can surface a UI indicator.
 */

import type { Vec3, ModelMesh } from '../contracts/renderer.v1.js';
import { computeCentroid } from './CentroidAxis.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface BoundingBoxFallbackResult {
  /** The computed center (either true centroid or bounding-box fallback). */
  center: Vec3;
  /** True when the bounding-box fallback was used. */
  isFallback: boolean;
  /** Reason for fallback (when isFallback is true). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Convexity heuristic
// ---------------------------------------------------------------------------

/**
 * Heuristic: a mesh is "convex" when the ratio of vertex count to index
 * count is above a threshold (triangulated convex hull has ~2:1 ratio
 * of indices to vertices).  This is a mock heuristic — real convexity
 * tests require O(n) cross-product sign checks.
 *
 * For mock purposes we mark meshes as non-convex when the triangle count
 * exceeds 5000 (heuristic threshold).
 */
export function isConvexHeuristic(mesh: ModelMesh): boolean {
  const triangleCount = mesh.indices.length / 3;
  return triangleCount <= 5000;
}

// ---------------------------------------------------------------------------
// BoundingBoxFallback
// ---------------------------------------------------------------------------

/**
 * Compute the center for a part, falling back to bounding-box center
 * with a flag when the part is non-convex.
 */
export function computePartCenter(mesh: ModelMesh): BoundingBoxFallbackResult {
  const convex = isConvexHeuristic(mesh);
  if (convex) {
    const centroid = computeCentroid(mesh);
    return { center: centroid.center, isFallback: false };
  }

  // Non-convex → bounding-box center fallback with flag
  const center: Vec3 = {
    x: (mesh.bounds.min.x + mesh.bounds.max.x) / 2,
    y: (mesh.bounds.min.y + mesh.bounds.max.y) / 2,
    z: (mesh.bounds.min.z + mesh.bounds.max.z) / 2,
  };
  return {
    center,
    isFallback: true,
    reason: 'Non-convex part; using bounding-box center',
  };
}

/**
 * Compute centers for multiple parts, applying fallback where needed.
 */
export function computePartCenters(
  parts: ModelMesh[],
): BoundingBoxFallbackResult[] {
  return parts.map((p) => computePartCenter(p));
}
