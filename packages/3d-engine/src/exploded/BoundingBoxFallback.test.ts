import { describe, it, expect } from 'vitest';
import {
  computePartCenter,
  computePartCenters,
  isConvexHeuristic,
} from './BoundingBoxFallback.js';
import type { ModelMesh } from '../contracts/renderer.v1.js';

function makeMesh(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  indexCount = 6,
): ModelMesh {
  return {
    id: 'mesh',
    name: 'Test Mesh',
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    indices: new Uint32Array(indexCount),
    materialId: 'mat',
    bounds: { min, max },
  };
}

describe('isConvexHeuristic', () => {
  it('marks small meshes as convex', () => {
    // 6 indices = 2 triangles ≤ 5000
    expect(isConvexHeuristic(makeMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 6))).toBe(true);
  });

  it('marks large meshes as non-convex', () => {
    // 15001 indices = 5001 triangles > 5000
    expect(isConvexHeuristic(makeMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 15001))).toBe(false);
  });
});

describe('computePartCenter', () => {
  it('returns centroid for convex part without fallback', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 6);
    const result = computePartCenter(mesh);
    expect(result.center).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.isFallback).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('returns bounding-box center with flag for non-convex part', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 15001);
    const result = computePartCenter(mesh);
    expect(result.center).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.isFallback).toBe(true);
    expect(result.reason).toBe('Non-convex part; using bounding-box center');
  });
});

describe('computePartCenters', () => {
  it('processes multiple parts', () => {
    const parts = [
      makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }, 6),
      makeMesh({ x: 4, y: 4, z: 4 }, { x: 8, y: 8, z: 8 }, 15001),
    ];
    const results = computePartCenters(parts);
    expect(results).toHaveLength(2);
    expect(results[0]!.isFallback).toBe(false);
    expect(results[1]!.isFallback).toBe(true);
    expect(results[0]!.center).toEqual({ x: 1, y: 1, z: 1 });
    expect(results[1]!.center).toEqual({ x: 6, y: 6, z: 6 });
  });

  it('returns empty array for empty input', () => {
    expect(computePartCenters([])).toHaveLength(0);
  });
});
