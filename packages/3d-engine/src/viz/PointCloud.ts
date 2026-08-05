/**
 * Point cloud — instanced points with LOD and a cost model.
 *
 * When the projected frame cost exceeds the budget (below 30 fps),
 * a 2D fallback suggestion is flagged.
 */

import type { Vec3, LODSelection, SceneTier } from '../contracts/renderer.v1.js';
import { DRAW_CALL_BUDGETS as BUDGETS } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface PointCloudConfig {
  points: Vec3[];
  /** Optional per-point sizes. */
  sizes?: number[];
  /** Optional per-point colours. */
  colors?: string[];
}

export interface PointCloudResult {
  /** Instanced positions (LOD-scaled count). */
  instances: Vec3[];
  instanceCount: number;
  lod: LODSelection;
  /** True when projected cost is below budget. */
  withinBudget: boolean;
  /** Fallback suggestion when below 30 fps. */
  fallback?: string;
  /** Estimated frames per second. */
  estimatedFps: number;
}

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

/**
 * Estimate frames per second for a point cloud.
 *
 * Base cost: ~4μs per point for GPU instancing at 60 fps target.
 * LOD levels scale the effective point count.
 * Hero tier has higher particle budgets than standard/background.
 */
export function estimatePointCloudFps(
  instanceCount: number,
  _lod: LODSelection,
  tier: SceneTier,
): number {
  const budget = BUDGETS[tier];
  // Normalise against the tier's particle budget
  const ratio = instanceCount / budget.maxParticles;
  // At ratio ≤ 1.0 → ~60 fps; beyond that, fps drops proportionally
  const rawFps = 60 / Math.max(ratio, 0.01);
  return Math.min(rawFps, 60);
}

// ---------------------------------------------------------------------------
// PointCloud
// ---------------------------------------------------------------------------

function lodScale(level: LODSelection['level']): number {
  switch (level) {
    case 0: return 1.0;
    case 1: return 0.5;
    case 2: return 0.25;
    case 3: return 0.125;
  }
}

/**
 * Generate instanced point positions with LOD scaling and a cost model.
 */
export function generatePointCloud(
  config: PointCloudConfig,
  lod: LODSelection,
  tier: SceneTier,
): PointCloudResult {
  const scale = lodScale(lod.level);
  const totalPoints = config.points.length;
  const scaledCount = Math.round(totalPoints * scale);
  const instances = config.points.slice(0, scaledCount);

  const estimatedFps = estimatePointCloudFps(scaledCount, lod, tier);
  const withinBudget = estimatedFps >= 30;

  let fallback: string | undefined;
  if (!withinBudget) {
    fallback = `2D fallback banner: ${scaledCount} points at ${Math.round(estimatedFps)} fps exceeds budget`;
  }

  return {
    instances,
    instanceCount: scaledCount,
    lod,
    withinBudget,
    ...(fallback !== undefined && { fallback }),
    estimatedFps,
  };
}
