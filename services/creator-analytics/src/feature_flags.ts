/**
 * Creator-analytics feature-flag guard (Phase 19 Wave 3).
 *
 * Env-var pattern: FEATURE_<GROUP>_<NAME>_DISABLED=true → 503.
 */

import { FeatureDisabledError } from './types.js';

export const FEATURE_FLAGS = {
  analytics: 'marketplace.analytics',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Check if a feature is disabled via env var.
 * If `FEATURE_<FLAG>_DISABLED` is 'true', throws FeatureDisabledError.
 */
export function checkFeature(flag: FeatureFlag): void {
  const envKey = `FEATURE_${flag.replace(/\./g, '_').toUpperCase()}_DISABLED`;
  if (process.env[envKey] === 'true') {
    throw new FeatureDisabledError(flag);
  }
}
