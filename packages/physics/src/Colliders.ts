/**
 * Collider shape factory.
 *
 * Each function returns a rapier ColliderDesc that can be passed
 * directly to `PhysicsWorld.createRigidBody()` or to `world.createCollider()`.
 *
 * For complex GLTF meshes (concave, > 100 k triangles), prefer
 * decomposing the mesh into convex parts and creating a compound body.
 * `trimesh()` works for simple concave shapes but rapier's trimesh
 * collider is a *dynamic* object that can cause tunnelling at high velocities.
 */

import RAPIER from '@dimforge/rapier3d-compat';

/** Create a cuboid (box) collider with the given half-extents. */
export function cuboid(halfX: number, halfY: number, halfZ: number): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ);
}

/** Create a sphere collider with the given radius. */
export function sphere(radius: number): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.ball(radius);
}

/**
 * Create a cylinder collider.
 * @param halfHeight - half the total height along the Y axis
 * @param radius - circular cross-section radius
 */
export function cylinder(halfHeight: number, radius: number): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.cylinder(halfHeight, radius);
}

/**
 * Create a capsule collider aligned along the Y axis.
 * @param halfHeight - half the height of the cylindrical section
 * @param radius - radius of the hemisphere caps (and the cylinder)
 */
export function capsule(halfHeight: number, radius: number): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.capsule(halfHeight, radius);
}

/**
 * Create a convex-hull collider from an array of 3D positions.
 * Positions must be a flat Float32Array with stride 3 (x, y, z, x, y, z, …).
 *
 * NOTE: rapier's convex-hull builder accepts at most 256 vertices.
 * If you have more, downsample or use a simplified convex hull first.
 */
export function convexHull(positions: Float32Array): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.convexHull(positions)!;
}

/**
 * Create a trimesh (triangle-mesh) collider for complex GLTF meshes.
 *
 * ⚠️ Concave meshes should prefer compound convex hulls for better
 * performance and to avoid tunnelling.  Use trimesh for simple concave
 * shapes only (e.g. terrain, stairs).
 *
 * @param vertices - flat Float32Array with stride 3
 * @param indices  - Uint32Array of triangle indices (stride 3)
 */
export function trimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.trimesh(vertices, indices);
}
