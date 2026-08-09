/**
 * Creator payout method logic (Phase 19 Wave 3).
 *
 * Pure functions for payout method creation and validation.
 * No I/O, no side effects.
 */

import type { PayoutMethodKind, OnboardingState } from './types.js';
import { MarketplaceValidationError } from '../types.js';

const VALID_KINDS: readonly PayoutMethodKind[] = [
  'stripe_connect',
  'bkash',
  'nagad',
  'bank',
];

/**
 * Validate payout method kind.
 * Returns true if valid, throws if invalid.
 */
export function validatePayoutMethodKind(kind: string): kind is PayoutMethodKind {
  if (!VALID_KINDS.includes(kind as PayoutMethodKind)) {
    throw new MarketplaceValidationError(
      `Invalid payout method kind: ${kind}. Must be one of: ${VALID_KINDS.join(', ')}`,
      'INVALID_PAYOUT_METHOD_KIND',
    );
  }
  return true;
}

/**
 * Validate payout method creation input.
 * Requires kyc_approved or beyond onboarding state.
 */
export function createPayoutMethodBody(
  currentState: OnboardingState,
  kind: string,
  externalAccountId: string,
): { valid: true; kind: PayoutMethodKind } {
  // Must be kyc_approved or beyond
  const allowedStates: OnboardingState[] = ['kyc_approved', 'payout_ready', 'active'];
  if (!allowedStates.includes(currentState)) {
    throw new MarketplaceValidationError(
      `Cannot create payout method from state: ${currentState}. Must be kyc_approved or beyond.`,
      'INVALID_ONBOARDING_STATE',
    );
  }

  validatePayoutMethodKind(kind);

  if (!externalAccountId || externalAccountId.trim().length === 0) {
    throw new MarketplaceValidationError(
      'external_account_id is required',
      'MISSING_EXTERNAL_ACCOUNT_ID',
    );
  }

  return { valid: true, kind: kind as PayoutMethodKind };
}

/**
 * Get payout connect link.
 * Requires kyc_approved state.
 */
export function connectLinkBody(currentState: OnboardingState): { valid: true } {
  const allowedStates: OnboardingState[] = ['kyc_approved', 'payout_ready', 'active'];
  if (!allowedStates.includes(currentState)) {
    throw new MarketplaceValidationError(
      `Cannot get payout connect link from state: ${currentState}. Must be kyc_approved or beyond.`,
      'INVALID_ONBOARDING_STATE',
    );
  }
  return { valid: true };
}
