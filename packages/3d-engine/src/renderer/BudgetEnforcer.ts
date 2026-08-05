/**
 * @domio/3d-engine — budget enforcement for render plans.
 *
 * Given a candidate RenderPlan, the budget tier, and renderer capabilities,
 * this module:
 *  - Selects LOD per mesh (distance / screen-radius heuristic).
 *  - Flags `degraded` when triangles, lights, or particles exceed budget.
 *  - Returns the enforced plan with decimation information.
 */

import type {
  RenderPlan,
  DrawCallBudget,
  RendererCapabilities,
  LODSelection,
  LODLevel,
} from '../contracts/renderer.v1.js';

export interface EnforcedPlan {
  plan: RenderPlan;
  /** Set `true` when any budget dimension was exceeded. */
  degraded: boolean;
  /** Per-mesh decimation targets (meshId → target triangle count). */
  decimationTargets: Record<string, number>;
  /** Human-readable warnings. */
  warnings: string[];
  /**
   * Per-mesh LOD selections as a flat field for callers that prefer not to
   * traverse `plan.lodSelection`. Mirrors `plan.lodSelection`.
   */
  lodSelection: Record<string, LODSelection>;
  /**
   * Total triangles after LOD selection. Sum of `triangleCount` across
   * every mesh in `lodSelection`. Reflects the post-LOD working set, not
   * the raw mesh input, so consumers can verify the enforced budget.
   */
  totalTriangles: number;
}

/** LOD reduction ratios per level (LOD0 = full, LOD3 = 12.5%). */
const LOD_RATIO: Record<LODLevel, number> = {
  0: 1.0,
  1: 0.5,
  2: 0.25,
  3: 0.125,
};

/**
 * Compute LOD selection for a single mesh based on distance and
 * screen-space radius.  The heuristic is a simple threshold cascade.
 */
function selectLOD(
  distance: number,
  screenRadiusPx: number,
  triangleBudget: number,
  totalTriangles: number,
): LODSelection {
  let level: LODLevel = 0;

  // Very far or very small on screen → aggressive LOD.
  if (distance > 100 || screenRadiusPx < 10) {
    level = 3;
  } else if (distance > 50 || screenRadiusPx < 50) {
    level = 2;
  } else if (distance > 20 || screenRadiusPx < 200) {
    level = 1;
  } else {
    level = 0;
  }

  // If even LOD0 exceeds the triangle budget, step down until it fits.
  while (level < 3 && Math.floor(totalTriangles * LOD_RATIO[level]) > triangleBudget) {
    level = (level + 1) as LODLevel;
  }

  return {
    level,
    triangleCount: Math.floor(totalTriangles * LOD_RATIO[level]),
    screenRadiusPx,
    distance,
  };
}

/**
 * Enforce budget constraints on a render plan.
 *
 * @param candidate - The incoming render plan.
 * @param budget    - The tier budget to enforce against.
 * @param capabilities - Renderer capabilities (maxTriangles, maxParticles).
 * @param meshTriangles - Map of meshId → total triangle count.
 * @param meshDistances - Map of meshId → { distance, screenRadiusPx }.
 */
export function enforceBudget(
  candidate: RenderPlan,
  budget: DrawCallBudget,
  capabilities: RendererCapabilities,
  meshTriangles: Record<string, number>,
  meshDistances: Record<string, number> = {},
): EnforcedPlan {
  const warnings: string[] = [];
  const decimationTargets: Record<string, number> = {};
  let degraded = false;

  // --- Triangle budget ---
  let totalTriangles = 0;
  const lodSelection: Record<string, LODSelection> = {};

  for (const tris of Object.values(meshTriangles)) {
    totalTriangles += tris;
  }

  // If total triangles exceed capabilities.maxTriangles, we must degrade.
  if (totalTriangles > capabilities.maxTriangles) {
    degraded = true;
  }

  // Compute per-mesh LOD selections.
  for (const [meshId, tris] of Object.entries(meshTriangles)) {
    const dist = meshDistances[meshId] ?? 30;
    const selection = selectLOD(dist, 200, budget.maxTriangles, tris);
    lodSelection[meshId] = selection;

    // If LOD0 exceeds the per-tier budget, set a decimation target.
    if (tris > budget.maxTriangles) {
      decimationTargets[meshId] = budget.maxTriangles;
    }
  }

  // Also check the sum of all LOD0 triangles against the tier budget.
  if (totalTriangles > budget.maxTriangles) {
    degraded = true;
    // Auto-decimate: compute a global target ratio.
    const ratio = budget.maxTriangles / totalTriangles;
    for (const meshId of Object.keys(meshTriangles)) {
      const target = Math.floor((meshTriangles[meshId] ?? 0) * ratio);
      decimationTargets[meshId] = target;
    }
  }

  // --- Light budget ---
  if (candidate.lights.length > budget.maxLights) {
    warnings.push(
      `Scene lights add GPU cost; consider baking. ` +
      `(${candidate.lights.length} lights exceed budget of ${budget.maxLights})`,
    );
    degraded = true;
  }

  // --- Particle budget ---
  // The effective particle cap is capabilities.maxParticles which already
  // accounts for the renderer's particleUplift (5x for WebGPU vs 1x WebGL2).
  // The tier budget.maxParticles is the baseline; capabilities.maxParticles
  // is the renderer-adjusted ceiling.
  const totalParticles = Object.values(candidate.particleCounts)
    .reduce((sum, n) => sum + n, 0);
  if (totalParticles > capabilities.maxParticles) {
    degraded = true;
  }

  // Build enforced plan: copy candidate but inject LOD + degraded flag.
  const enforcedPlan: RenderPlan = {
    ...candidate,
    lodSelection,
    degraded: degraded || candidate.degraded,
  };

  // Sum the post-LOD triangle counts across all meshes. This is what the
  // renderer will actually push, not the raw input mesh totals.
  const enforcedTotalTriangles = Object.values(lodSelection).reduce(
    (sum, sel) => sum + sel.triangleCount,
    0,
  );

  return {
    plan: enforcedPlan,
    degraded,
    decimationTargets,
    warnings,
    lodSelection,
    totalTriangles: enforcedTotalTriangles,
  };
}
