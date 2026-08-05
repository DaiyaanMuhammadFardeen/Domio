/**
 * @domio/3d-engine — texture budget enforcement.
 *
 * Limits texture memory and resolution per tier, with per-org override.
 */

import type { SceneTier } from '../contracts/renderer.v1.js';

export interface TextureBudget {
  /** Maximum total texture memory in bytes. */
  maxTextureBytes: number;
  /** Maximum texture dimension (width or height) in pixels. */
  maxTextureDimension: number;
  /** Maximum number of unique textures. */
  maxTextureCount: number;
}

/** Default texture budgets per tier. */
const TEXTURE_BUDGETS: Record<SceneTier, TextureBudget> = {
  hero: {
    maxTextureBytes: 512 * 1024 * 1024, // 512 MB
    maxTextureDimension: 4096,
    maxTextureCount: 32,
  },
  standard: {
    maxTextureBytes: 128 * 1024 * 1024, // 128 MB
    maxTextureDimension: 2048,
    maxTextureCount: 16,
  },
  background: {
    maxTextureBytes: 32 * 1024 * 1024, // 32 MB
    maxTextureDimension: 1024,
    maxTextureCount: 4,
  },
};

export interface TextureBudgetConfig {
  orgOverrides?: Partial<Record<SceneTier, Partial<TextureBudget>>>;
}

/**
 * Get the effective texture budget for a tier.
 */
export function getTextureBudget(
  tier: SceneTier,
  config?: TextureBudgetConfig,
): TextureBudget {
  const base = TEXTURE_BUDGETS[tier];
  const override = config?.orgOverrides?.[tier];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Check if texture usage exceeds the budget.
 * Returns the violations found.
 */
export function checkTextureBudget(
  usage: { totalBytes: number; maxDimension: number; count: number },
  tier: SceneTier,
  config?: TextureBudgetConfig,
): { withinBudget: boolean; violations: string[] } {
  const budget = getTextureBudget(tier, config);
  const violations: string[] = [];

  if (usage.totalBytes > budget.maxTextureBytes) {
    violations.push(
      `Texture memory ${(usage.totalBytes / (1024 * 1024)).toFixed(0)}MB exceeds budget of ${(budget.maxTextureBytes / (1024 * 1024)).toFixed(0)}MB`,
    );
  }
  if (usage.maxDimension > budget.maxTextureDimension) {
    violations.push(
      `Texture dimension ${usage.maxDimension}px exceeds limit of ${budget.maxTextureDimension}px`,
    );
  }
  if (usage.count > budget.maxTextureCount) {
    violations.push(
      `Texture count ${usage.count} exceeds limit of ${budget.maxTextureCount}`,
    );
  }

  return {
    withinBudget: violations.length === 0,
    violations,
  };
}
