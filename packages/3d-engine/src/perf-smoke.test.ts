/**
 * @domio/3d-engine — perf smoke: LOD/budget math at scale (R-11-2 target:
 * 1.5M-tri hero scene LOD selection within the frame budget).
 *
 * Pure-math budget enforcement over a hero-tier scene with many meshes must
 * complete far inside the 16.67 ms frame window. Generous wall-clock budget
 * (10x headroom) for CI stability.
 */

import { describe, it, expect } from 'vitest';
import { enforceBudget } from './renderer/BudgetEnforcer.js';
import { DRAW_CALL_BUDGETS, type RendererCapabilities, type RenderPlan } from './contracts/renderer.v1.js';

const WEBGPU_CAPS: RendererCapabilities = {
  kind: 'webgpu',
  maxTriangles: 10_000_000,
  maxParticles: 1_250_000,
  extensions: [],
  particleUplift: 5,
};

describe('perf smoke — 1.5M-tri LOD selection (R-11-2)', () => {
  it('enforces the hero budget across 200 meshes well inside the frame window', () => {
    const hero = DRAW_CALL_BUDGETS.hero; // 1.5M triangles, 4 lights, 250k particles
    const meshTriangles: Record<string, number> = {};
    const meshDistances: Record<string, number> = {};
    // 200 meshes summing to ~1.5M triangles.
    for (let i = 0; i < 200; i++) {
      meshTriangles[`mesh-${i}`] = 7500;
      meshDistances[`mesh-${i}`] = 10 + (i % 20) * 4;
    }

    const plan: RenderPlan = {
      lodSelection: {},
      lights: Array.from({ length: 3 }, () => ({
        kind: 'directional' as const,
        color: '#ffffff',
        intensity: 1,
      })),
      camera: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, rollDeg: 0 },
      particleCounts: { snow: 50_000, dust: 20_000 },
      degraded: false,
      tier: 'hero',
    };

    const t0 = performance.now();
    const enforced = enforceBudget(plan, hero, WEBGPU_CAPS, meshTriangles, meshDistances);
    const elapsedMs = performance.now() - t0;

    expect(Object.keys(enforced.lodSelection).length).toBe(200);
    // Hero budget: total must not exceed 1.5M triangles.
    expect(enforced.totalTriangles).toBeLessThanOrEqual(1_500_000);
    // 10x headroom on the 16.67 ms frame window.
    expect(elapsedMs).toBeLessThan(100);
  });

  it('auto-decimates an oversized 3M-tri scene down to the hero budget', () => {
    const hero = DRAW_CALL_BUDGETS.hero;
    const meshTriangles: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      meshTriangles[`mesh-${i}`] = 10_000; // 3M total
    }
    const plan: RenderPlan = {
      lodSelection: {},
      lights: [{ kind: 'directional' as const, color: '#ffffff', intensity: 1 }],
      camera: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, rollDeg: 0 },
      particleCounts: {},
      degraded: false,
      tier: 'hero',
    };

    const t0 = performance.now();
    const enforced = enforceBudget(plan, hero, WEBGPU_CAPS, meshTriangles);
    const elapsedMs = performance.now() - t0;

    expect(enforced.degraded).toBe(true);
    expect(Object.keys(enforced.decimationTargets).length).toBe(300);
    expect(enforced.totalTriangles).toBeLessThanOrEqual(1_500_000);
    expect(elapsedMs).toBeLessThan(100);
  });
});
