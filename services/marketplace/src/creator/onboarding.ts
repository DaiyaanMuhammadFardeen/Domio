/**
 * Creator onboarding transitions (Phase 19 Wave 3).
 *
 * Pure logic for onboarding state machine.
 * No I/O, no side effects.
 */

import type { OnboardingState } from './types.js';
import { OnboardingTransitionError } from './types.js';

/**
 * Allowed onboarding transitions.
 *
 * Flow:
 *   pending → profile_complete → kyc_required → kyc_submitted → kyc_approved → payout_ready → active
 *                                                     ↓
 *                                                kyc_required (rejected)
 *
 * Free listings allowed at profile_complete.
 * Paid listings require payout_ready or active.
 */
export const ONBOARDING_TRANSITIONS: Record<OnboardingState, readonly OnboardingState[]> = {
  pending:          ['profile_complete'],
  profile_complete: ['kyc_required', 'active'],
  kyc_required:     ['kyc_submitted'],
  kyc_submitted:    ['kyc_approved', 'kyc_required'],
  kyc_approved:     ['payout_ready'],
  payout_ready:     ['active'],
  active:           [],
};

/**
 * Validate whether a transition is allowed.
 * Throws OnboardingTransitionError if not.
 */
export function validateTransition(current: OnboardingState, next: OnboardingState): void {
  const allowed = ONBOARDING_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new OnboardingTransitionError(current, next);
  }
}

/**
 * Check if creator can sell paid listings.
 * Requires payout_ready or active state.
 * Free listings are allowed at profile_complete.
 */
export function canSellPaidListings(state: OnboardingState): boolean {
  return state === 'payout_ready' || state === 'active';
}
