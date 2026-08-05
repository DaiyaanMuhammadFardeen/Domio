/**
 * @domio/3d-engine — polygon budget enforcement.
 *
 * Tier budgets from DRAW_CALL_BUDGETS with per-org override.
 * Computes decimation targets and human-readable toast messages.
 */

import type { SceneTier, DrawCallBudget } from '../contracts/renderer.v1.js';
import { DRAW_CALL_BUDGETS } from '../contracts/renderer.v1.js';

export interface DecimationResult {
  /** Whether decimation was applied. */
  decimated: boolean;
  /** The target triangle count after decimation. */
  targetTriangles: number;
  /** The original triangle count. */
  originalTriangles: number;
  /** Human-readable toast message including "Restore original" affordance. */
  toastMessage: string;
  /** Toast data for the "Restore original" button. */
  toastData: {
    originalTriangles: number;
    targetTriangles: number;
  };
}

export interface PolygonBudgetConfig {
  /** Per-org tier overrides. Key: tier name, value: override DrawCallBudget. */
  orgOverrides?: Partial<Record<SceneTier, Partial<DrawCallBudget>>>;
}

/**
 * Get the effective budget for a tier, applying any org overrides.
 */
export function getEffectiveBudget(
  tier: SceneTier,
  config?: PolygonBudgetConfig,
): DrawCallBudget {
  const base = DRAW_CALL_BUDGETS[tier];
  const override = config?.orgOverrides?.[tier];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Check if a triangle count exceeds the polygon budget for a tier.
 * If so, compute the decimation target.
 */
export function enforcePolygonBudget(
  triangleCount: number,
  tier: SceneTier,
  config?: PolygonBudgetConfig,
): DecimationResult {
  const budget = getEffectiveBudget(tier, config);

  if (triangleCount <= budget.maxTriangles) {
    return {
      decimated: false,
      targetTriangles: triangleCount,
      originalTriangles: triangleCount,
      toastMessage: '',
      toastData: { originalTriangles: triangleCount, targetTriangles: triangleCount },
    };
  }

  const target = budget.maxTriangles;
  const formatted = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  };

  const toastMessage =
    `Reduced from ${formatted(triangleCount)} to ${formatted(target)} tris for performance — restore original`;

  return {
    decimated: true,
    targetTriangles: target,
    originalTriangles: triangleCount,
    toastMessage,
    toastData: {
      originalTriangles: triangleCount,
      targetTriangles: target,
    },
  };
}

/**
 * Get tier budget limits for display / validation.
 */
export function getTierBudgets(): Record<SceneTier, DrawCallBudget> {
  return { ...DRAW_CALL_BUDGETS };
}
