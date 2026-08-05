import { describe, it, expect } from 'vitest';
import { generatePointCloud, estimatePointCloudFps } from './PointCloud.js';
import type { Vec3, LODSelection } from '../contracts/renderer.v1.js';

function makeLod(level: 0 | 1 | 2 | 3): LODSelection {
  return { level, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
}

function makePoints(n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i % 10,
    y: Math.floor(i / 10),
    z: 0,
  }));
}

describe('estimatePointCloudFps', () => {
  it('returns 60 fps for a small point count', () => {
    const fps = estimatePointCloudFps(100, makeLod(0), 'hero');
    expect(fps).toBe(60);
  });

  it('drops below 60 fps when count exceeds tier budget', () => {
    // hero maxParticles = 250_000
    const fps = estimatePointCloudFps(500_000, makeLod(0), 'hero');
    expect(fps).toBeLessThan(60);
  });

  it('reports 2D fallback for 1M points at low fps', () => {
    // 1M points on hero = 4x budget → ~15 fps
    const fps = estimatePointCloudFps(1_000_000, makeLod(0), 'hero');
    expect(fps).toBeLessThan(30);
  });
});

describe('generatePointCloud', () => {
  it('generates instances within budget', () => {
    const points = makePoints(1000);
    const result = generatePointCloud({ points }, makeLod(0), 'hero');
    expect(result.instanceCount).toBe(1000);
    expect(result.withinBudget).toBe(true);
    expect(result.fallback).toBeUndefined();
  });

  it('flags 2D fallback when projected cost exceeds budget', () => {
    const points = makePoints(1_000_000);
    const result = generatePointCloud({ points }, makeLod(0), 'hero');
    expect(result.withinBudget).toBe(false);
    expect(result.fallback).toBeDefined();
    expect(result.fallback).toContain('2D fallback banner');
  });

  it('scales instances by LOD level', () => {
    const points = makePoints(1000);
    const r0 = generatePointCloud({ points }, makeLod(0), 'hero');
    const r1 = generatePointCloud({ points }, makeLod(1), 'hero');
    expect(r0.instanceCount).toBe(1000);
    expect(r1.instanceCount).toBe(500);
  });

  it('reports estimated fps', () => {
    const points = makePoints(100);
    const result = generatePointCloud({ points }, makeLod(0), 'hero');
    expect(result.estimatedFps).toBe(60);
  });
});
