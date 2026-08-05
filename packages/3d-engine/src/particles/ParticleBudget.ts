/**
 * Particle budget enforcement.
 *
 * Defines per-backend budgets and validates emitter counts against
 * the tier budgets from the renderer contract.  WebGPU gets a 5× uplift
 * on the tier's base particle budget.
 */

import { DRAW_CALL_BUDGETS } from '../contracts/renderer.v1.js';
import type { SceneTier, LODSelection } from '../contracts/renderer.v1.js';
import type { GPUBackend } from './EmitterConfig.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface ParticleBudgetResult {
  /** Maximum allowed particles (tier budget × uplift, capped by backend limit). */
  maxParticles: number;
  /** Suggested particle count after LOD scaling. */
  suggestedCount: number;
  /** Whether the requested count is within budget. */
  withinBudget: boolean;
  /** Tier's base particle budget (before uplift). */
  tierBudget: number;
}

// ---------------------------------------------------------------------------
// ParticleBudget
// ---------------------------------------------------------------------------

const BACKEND_LIMITS: Record<GPUBackend, number> = {
  webgl2: 250_000,
  webgpu: 1_000_000,
};

/** WebGPU uplift multiplier (5× per doc §4.4). */
const WEBGPU_UPLIFT = 5;

/**
 * Compute the effective particle budget for a backend and tier.
 *
 * Effective budget = min(tierBudget × uplift, backendLimit)
 */
export function computeParticleBudget(
  backend: GPUBackend,
  tier: SceneTier,
  lod: LODSelection,
  requestedCount: number,
): ParticleBudgetResult {
  const tierBudget = DRAW_CALL_BUDGETS[tier].maxParticles;
  const backendMax = BACKEND_LIMITS[backend];
  const uplift = backend === 'webgpu' ? WEBGPU_UPLIFT : 1;
  const maxParticles = Math.min(tierBudget * uplift, backendMax);

  // LOD scaling
  const lodScale = 1 / Math.pow(2, lod.level);
  const suggestedCount = Math.round(requestedCount * lodScale);

  return {
    maxParticles,
    suggestedCount,
    withinBudget: suggestedCount <= maxParticles,
    tierBudget,
  };
}

/**
 * Get the backend limit for a GPU backend.
 */
export function getBackendLimit(backend: GPUBackend): number {
  return BACKEND_LIMITS[backend];
}
