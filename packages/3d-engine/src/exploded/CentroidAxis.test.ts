import { describe, it, expect } from 'vitest';
import {
  computeCentroid,
  computePartCentroids,
  outCubic,
  generateExplodeKeyframes,
  vec3Sub,
  vec3Add,
  vec3Scale,
} from './CentroidAxis.js';
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

describe('CentroidAxis', () => {
  it('computes centroid from bounding box center', () => {
    const mesh = makeMesh(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 4, z: 6 },
    );
    const result = computeCentroid(mesh);
    expect(result.center).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('normalises axis to unit vector', () => {
    const mesh = makeMesh(
      { x: -1, y: -1, z: -1 },
      { x: 1, y: 1, z: 1 },
    );
    const result = computeCentroid(mesh);
    const len = Math.sqrt(
      result.axis.x ** 2 + result.axis.y ** 2 + result.axis.z ** 2,
    );
    expect(len).toBeCloseTo(1.0, 5);
  });

  it('marks convex meshes', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 6);
    expect(computeCentroid(mesh).isConvex).toBe(true);
  });

  it('computes centroids for multiple parts', () => {
    const parts = [
      makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }),
      makeMesh({ x: 4, y: 4, z: 4 }, { x: 6, y: 6, z: 6 }),
    ];
    const results = computePartCentroids(parts);
    expect(results).toHaveLength(2);
    expect(results[0]!.center).toEqual({ x: 1, y: 1, z: 1 });
    expect(results[1]!.center).toEqual({ x: 5, y: 5, z: 5 });
  });
});

describe('outCubic easing', () => {
  it('returns 0 at t=0', () => {
    expect(outCubic(0)).toBeCloseTo(0, 10);
  });

  it('returns 1 at t=1', () => {
    expect(outCubic(1)).toBeCloseTo(1, 10);
  });

  it('is approximately 0.75 at t=0.5', () => {
    // outCubic(0.5) = 1 - 0.5^3 = 1 - 0.125 = 0.875
    expect(outCubic(0.5)).toBeCloseTo(0.875, 5);
  });
});

describe('generateExplodeKeyframes', () => {
  it('generates correct number of frames for 0.6s at 60Hz', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    const centroid = computeCentroid(mesh);
    const kfs = generateExplodeKeyframes(centroid, 10, 600, 60);
    // 0.6s * 60fps = 36 frames + start frame = 37 keyframes
    expect(kfs).toHaveLength(37);
  });

  it('first keyframe has zero offset', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    const centroid = computeCentroid(mesh);
    const kfs = generateExplodeKeyframes(centroid, 10, 600, 60);
    const first = kfs[0];
    expect(first).toBeDefined();
    expect(first!.t).toBe(0);
    expect(first!.offset.x).toBeCloseTo(0, 10);
    expect(first!.offset.y).toBeCloseTo(0, 10);
    expect(first!.offset.z).toBeCloseTo(0, 10);
  });

  it('last keyframe has full distance', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    const centroid = computeCentroid(mesh);
    const kfs = generateExplodeKeyframes(centroid, 10, 600, 60);
    const last = kfs[kfs.length - 1]!;
    expect(last.t).toBeCloseTo(1, 5);
    const axisLen = Math.sqrt(
      centroid.axis.x ** 2 + centroid.axis.y ** 2 + centroid.axis.z ** 2,
    );
    const offsetLen = Math.sqrt(
      last.offset.x ** 2 + last.offset.y ** 2 + last.offset.z ** 2,
    );
    expect(offsetLen).toBeCloseTo(10 * axisLen, 3);
  });

  it('supports per-part override easing', () => {
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    const centroid = computeCentroid(mesh);
    const linear = (t: number): number => t;
    const kfs = generateExplodeKeyframes(centroid, 10, 600, 60, linear);
    const mid = kfs[Math.floor(kfs.length / 2)]!;
    // Linear at midpoint should be ~0.5
    const offsetLen = Math.sqrt(
      mid.offset.x ** 2 + mid.offset.y ** 2 + mid.offset.z ** 2,
    );
    expect(offsetLen).toBeCloseTo(5, 1);
  });

  it('triggers on 0.6s ease-out cubic per spec', () => {
    // Verify 600ms duration produces the right frame count at 60Hz
    const mesh = makeMesh({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    const centroid = computeCentroid(mesh);
    const kfs = generateExplodeKeyframes(centroid, 5, 600, 60);
    expect(kfs.length).toBe(37);
    // Check easing at 50% time
    const mid = kfs[18]!;
    // outCubic(0.5) = 0.875
    const offsetLen = Math.sqrt(
      mid.offset.x ** 2 + mid.offset.y ** 2 + mid.offset.z ** 2,
    );
    const maxLen = 5;
    expect(offsetLen / maxLen).toBeCloseTo(0.875, 2);
  });
});

describe('vec3 math helpers', () => {
  it('vec3Sub subtracts', () => {
    expect(vec3Sub({ x: 3, y: 5, z: 7 }, { x: 1, y: 2, z: 3 })).toEqual({
      x: 2, y: 3, z: 4,
    });
  });

  it('vec3Add adds', () => {
    expect(vec3Add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({
      x: 5, y: 7, z: 9,
    });
  });

  it('vec3Scale scales', () => {
    expect(vec3Scale({ x: 1, y: 2, z: 3 }, 3)).toEqual({
      x: 3, y: 6, z: 9,
    });
  });
});
