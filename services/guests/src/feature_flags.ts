/**
 * Feature-flag guard for guest modules (Phase 18).
 *
 * Env-var pattern: FEATURE_<FLAG>_DISABLED=true → 503.
 * Mirrors repo convention from collab service.
 */

import { FeatureDisabledError } from './types.js';

export const FEATURE_FLAGS = {
  guests: 'collab.guests',
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
