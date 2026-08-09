/**
 * Creator KYC session logic (Phase 19 Wave 3).
 *
 * Pure functions for KYC session lifecycle.
 * No I/O, no side effects.
 */

import type { OnboardingState, KycStatus } from './types.js';
import { MarketplaceValidationError } from '../types.js';

/**
 * Start KYC session.
 * Requires profile_complete onboarding state.
 * Returns the next onboarding state.
 */
export function startKycSessionBody(currentState: OnboardingState): {
  nextState: OnboardingState;
  kycStatus: KycStatus;
} {
  if (currentState !== 'profile_complete') {
    throw new MarketplaceValidationError(
      `Cannot start KYC from state: ${currentState}`,
      'INVALID_ONBOARDING_STATE',
    );
  }
  return {
    nextState: 'kyc_submitted',
    kycStatus: 'submitted',
  };
}

/**
 * Poll KYC status and advance onboarding.
 * Handles approved/rejected transitions.
 */
export function pollKycStatusBody(
  currentState: OnboardingState,
  pollResult: KycStatus,
): {
  nextState: OnboardingState;
  kycStatus: KycStatus;
} {
  if (pollResult === 'approved') {
    // kyc_submitted → kyc_approved
    if (currentState === 'kyc_submitted') {
      return { nextState: 'kyc_approved', kycStatus: 'approved' };
    }
  }

  if (pollResult === 'rejected') {
    // kyc_submitted → kyc_required (retry)
    if (currentState === 'kyc_submitted') {
      return { nextState: 'kyc_required', kycStatus: 'rejected' };
    }
  }

  // pending or submitted: no state change
  return { nextState: currentState, kycStatus: pollResult };
}
