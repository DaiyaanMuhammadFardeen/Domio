/**
 * Partner API access control (Phase 19 Wave 5 — WS-MKT-5/8/9).
 *
 * Validates partner client scopes and rate limits.
 */

import type { PartnerClient, PartnerClientTier } from '../types.js';

// ---------------------------------------------------------------------------
// Rate limit tiers
// ---------------------------------------------------------------------------

export const RATE_LIMIT_TIERS: Record<PartnerClientTier, { requestsPerMinute: number }> = {
  pro: { requestsPerMinute: 600 },
  enterprise: { requestsPerMinute: 6000 },
};

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

/**
 * Check if a partner client has the required scope.
 * Returns true if scope is granted, false otherwise.
 */
export function hasScope(client: PartnerClient, requiredScope: string): boolean {
  return client.scopes.includes(requiredScope);
}

/**
 * Get rate limit for a partner client tier.
 */
export function getRateLimit(tier: PartnerClientTier): number {
  return RATE_LIMIT_TIERS[tier]?.requestsPerMinute ?? 600;
}

/**
 * Validate partner client access for a specific operation.
 * Returns null if valid, or an error message if not.
 */
export function validatePartnerAccess(
  client: PartnerClient,
  requiredScope: string,
): { valid: true } | { valid: false; error: string; code: string } {
  if (!hasScope(client, requiredScope)) {
    return {
      valid: false,
      error: `Insufficient scope: ${requiredScope} required`,
      code: 'INSUFFICIENT_SCOPE',
    };
  }
  return { valid: true };
}
