/**
 * Quota fallback — deterministic decision logic for when a map provider's
 * tile/API quota is exceeded.
 *
 * The map renders a static image when over quota, and a simplified (fewer
 * tiles / lower zoom) style when severely over quota.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FallbackMode = 'live' | 'static' | 'simplified';

export interface QuotaState {
  /** Number of tile loads used this billing period. */
  readonly used: number;
  /** Provider quota limit (0 = unlimited). */
  readonly limit: number;
  /** Threshold ratio at which we degrade to static (0..1). Default 0.9. */
  readonly staticThreshold?: number;
  /** Threshold ratio at which we degrade further to simplified (0..1). Default 1.0. */
  readonly simplifiedThreshold?: number;
}

export interface QuotaFallbackResult {
  /** The rendering mode to use. */
  readonly fallback: FallbackMode;
  /** Human-readable reason for the decision. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STATIC_THRESHOLD = 0.9;
const DEFAULT_SIMPLIFIED_THRESHOLD = 1.0;

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate fallback mode given a quota state.
 *
 * - `limit === 0` → unlimited → always live.
 * - `used / limit >= simplifiedThreshold` → 'simplified'
 * - `used / limit >= staticThreshold` → 'static'
 * - Otherwise → 'live'
 */
export function getQuotaFallback(state: QuotaState): QuotaFallbackResult {
  const { used, limit } = state;
  const staticThreshold = state.staticThreshold ?? DEFAULT_STATIC_THRESHOLD;
  const simplifiedThreshold =
    state.simplifiedThreshold ?? DEFAULT_SIMPLIFIED_THRESHOLD;

  // Unlimited quota
  if (limit === 0) {
    return { fallback: 'live', reason: 'Unlimited quota' };
  }

  if (limit < 0) {
    return { fallback: 'live', reason: 'Invalid quota limit treated as unlimited' };
  }

  const ratio = used / limit;

  if (ratio >= simplifiedThreshold) {
    return {
      fallback: 'simplified',
      reason: `Quota severely exceeded (${used}/${limit}, ${(ratio * 100).toFixed(0)}% used)`,
    };
  }

  if (ratio >= staticThreshold) {
    return {
      fallback: 'static',
      reason: `Quota nearly exceeded (${used}/${limit}, ${(ratio * 100).toFixed(0)}% used)`,
    };
  }

  return {
    fallback: 'live',
    reason: `Quota within limits (${used}/${limit}, ${(ratio * 100).toFixed(0)}% used)`,
  };
}

/**
 * Increment a usage counter and return the new state.
 * Pure function — does not mutate the input.
 */
export function incrementUsage(state: QuotaState, amount: number = 1): QuotaState {
  return {
    ...state,
    used: state.used + amount,
  };
}
