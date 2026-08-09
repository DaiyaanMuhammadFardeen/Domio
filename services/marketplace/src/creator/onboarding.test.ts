/**
 * Creator onboarding transitions tests (Phase 19 Wave 3).
 *
 * All 8 valid transitions + invalid cases.
 */

import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_TRANSITIONS,
  validateTransition,
  canSellPaidListings,
} from './onboarding.js';
import { OnboardingTransitionError } from './types.js';
import type { OnboardingState } from './types.js';

describe('ONBOARDING_TRANSITIONS', () => {
  // ---------------------------------------------------------------------------
  // Valid transitions (8 total)
  // ---------------------------------------------------------------------------

  it('pending → profile_complete (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.pending).toContain('profile_complete');
  });

  it('profile_complete → kyc_required (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.profile_complete).toContain('kyc_required');
  });

  it('profile_complete → active (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.profile_complete).toContain('active');
  });

  it('kyc_required → kyc_submitted (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_required).toContain('kyc_submitted');
  });

  it('kyc_submitted → kyc_approved (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_submitted).toContain('kyc_approved');
  });

  it('kyc_submitted → kyc_required (valid - rejected retry)', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_submitted).toContain('kyc_required');
  });

  it('kyc_approved → payout_ready (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_approved).toContain('payout_ready');
  });

  it('payout_ready → active (valid)', () => {
    expect(ONBOARDING_TRANSITIONS.payout_ready).toContain('active');
  });

  // ---------------------------------------------------------------------------
  // Invalid transitions
  // ---------------------------------------------------------------------------

  it('active → [] (no transitions allowed)', () => {
    expect(ONBOARDING_TRANSITIONS.active).toHaveLength(0);
  });

  it('pending cannot go directly to kyc_required', () => {
    expect(ONBOARDING_TRANSITIONS.pending).not.toContain('kyc_required');
  });

  it('pending cannot go directly to kyc_submitted', () => {
    expect(ONBOARDING_TRANSITIONS.pending).not.toContain('kyc_submitted');
  });

  it('profile_complete cannot go directly to kyc_submitted', () => {
    expect(ONBOARDING_TRANSITIONS.profile_complete).not.toContain('kyc_submitted');
  });

  it('kyc_required cannot go directly to kyc_approved', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_required).not.toContain('kyc_approved');
  });

  it('kyc_approved cannot go directly to active', () => {
    expect(ONBOARDING_TRANSITIONS.kyc_approved).not.toContain('active');
  });

  it('payout_ready cannot go directly to kyc_approved', () => {
    expect(ONBOARDING_TRANSITIONS.payout_ready).not.toContain('kyc_approved');
  });

  // ---------------------------------------------------------------------------
  // All statuses are covered
  // ---------------------------------------------------------------------------

  it('covers all 7 onboarding statuses', () => {
    const statuses: OnboardingState[] = [
      'pending', 'profile_complete', 'kyc_required', 'kyc_submitted',
      'kyc_approved', 'payout_ready', 'active',
    ];
    for (const status of statuses) {
      expect(ONBOARDING_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(ONBOARDING_TRANSITIONS[status])).toBe(true);
    }
  });
});

describe('validateTransition', () => {
  it('allows valid transition', () => {
    expect(() => validateTransition('pending', 'profile_complete')).not.toThrow();
  });

  it('throws OnboardingTransitionError for invalid transition', () => {
    expect(() => validateTransition('pending', 'kyc_submitted')).toThrow(OnboardingTransitionError);
  });
});

describe('canSellPaidListings', () => {
  it('returns true for payout_ready', () => {
    expect(canSellPaidListings('payout_ready')).toBe(true);
  });

  it('returns true for active', () => {
    expect(canSellPaidListings('active')).toBe(true);
  });

  it('returns false for pending', () => {
    expect(canSellPaidListings('pending')).toBe(false);
  });

  it('returns false for profile_complete', () => {
    expect(canSellPaidListings('profile_complete')).toBe(false);
  });

  it('returns false for kyc_required', () => {
    expect(canSellPaidListings('kyc_required')).toBe(false);
  });

  it('returns false for kyc_submitted', () => {
    expect(canSellPaidListings('kyc_submitted')).toBe(false);
  });

  it('returns false for kyc_approved', () => {
    expect(canSellPaidListings('kyc_approved')).toBe(false);
  });
});
