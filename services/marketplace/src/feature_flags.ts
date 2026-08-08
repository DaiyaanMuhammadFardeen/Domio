/**
 * Feature-flag guard for marketplace modules (Phase 19).
 *
 * Env-var pattern: FEATURE_<MODULE>_DISABLED=true → 503.
 * Mirrors repo convention from phase-19.yaml.
 */

import { FeatureDisabledError } from './types.js';

export const FEATURE_FLAGS = {
  storefront:  'marketplace.storefront',
  creator:     'marketplace.creator',
  reviews:     'marketplace.reviews',
  pricing:     'marketplace.pricing',
  subscription:'marketplace.subscription',
  refund:      'marketplace.refund',
  chargeback:  'marketplace.chargeback',
  curated:     'marketplace.curated',
  kyc:         'marketplace.kyc',
  payout:      'marketplace.payout',
  analytics:   'marketplace.analytics',
  takedown:    'marketplace.takedown',
  partnerApi:  'marketplace.partner_api',
  mcp:         'marketplace.mcp',
  webhooks:    'marketplace.webhooks',
  audit:       'marketplace.audit',
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
