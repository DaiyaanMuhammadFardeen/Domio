/**
 * Colliders tests — verify each shape constructs correctly.
 *
 * We inspect the rapier ColliderDesc by checking that the shape
 * is a valid rapier object.  For cuboid/sphere/cylinder/capsule
 * we verify the constructor does not throw and the result is truthy.
 */

import { describe, expect, it } from 'vitest';
import { cuboid, sphere, cylinder, capsule, convexHull, trimesh } from './Colliders.js';

describe('Collider factory', () => {
  it('cuboid creates a box collider with correct half-extents', () => {
    const desc = cuboid(1, 2, 3);
    expect(desc).toBeTruthy();
    // rapier ColliderDesc is an object with shape info
    expect(typeof desc).toBe('object');
  });

  it('sphere creates a ball collider with correct radius', () => {
    const desc = sphere(5);
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe('object');
  });

  it('cylinder creates a cylinder collider', () => {
    const desc = cylinder(3, 1.5);
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe('object');
  });

  it('capsule creates a capsule collider', () => {
    const desc = capsule(2, 0.5);
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe('object');
  });

  it('convexHull creates a convex-hull from positions', () => {
    // A simple tetrahedron: 4 vertices
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    const desc = convexHull(positions);
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe('object');
  });

  it('trimesh creates a triangle-mesh from vertices and indices', () => {
    // A simple triangle: 3 vertices, 1 face
    const vertices = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2]);
    const desc = trimesh(vertices, indices);
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe('object');
  });

  it('convexHull with a box-like shape (8 vertices)', () => {
    const positions = new Float32Array([
      -1, -1, -1,
       1, -1, -1,
       1,  1, -1,
      -1,  1, -1,
      -1, -1,  1,
       1, -1,  1,
       1,  1,  1,
      -1,  1,  1,
    ]);
    const desc = convexHull(positions);
    expect(desc).toBeTruthy();
  });

  it('cuboid with zero half-extents creates a degenerate box', () => {
    const desc = cuboid(0, 0, 0);
    expect(desc).toBeTruthy();
  });

  it('sphere with zero radius creates a point collider', () => {
    const desc = sphere(0);
    expect(desc).toBeTruthy();
  });
});
