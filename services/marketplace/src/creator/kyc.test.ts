/**
 * Creator KYC session logic tests (Phase 19 Wave 3).
 *
 * Tests for KYC session lifecycle.
 */

import { describe, it, expect } from 'vitest';
import { startKycSessionBody, pollKycStatusBody } from './kyc.js';

describe('startKycSessionBody', () => {
  it('transitions profile_complete → kyc_submitted', () => {
    const result = startKycSessionBody('profile_complete');
    expect(result.nextState).toBe('kyc_submitted');
    expect(result.kycStatus).toBe('submitted');
  });

  it('throws for pending state', () => {
    expect(() => startKycSessionBody('pending')).toThrow('Cannot start KYC from state: pending');
  });

  it('throws for kyc_required state', () => {
    expect(() => startKycSessionBody('kyc_required')).toThrow('Cannot start KYC from state: kyc_required');
  });

  it('throws for kyc_submitted state', () => {
    expect(() => startKycSessionBody('kyc_submitted')).toThrow('Cannot start KYC from state: kyc_submitted');
  });

  it('throws for kyc_approved state', () => {
    expect(() => startKycSessionBody('kyc_approved')).toThrow('Cannot start KYC from state: kyc_approved');
  });

  it('throws for payout_ready state', () => {
    expect(() => startKycSessionBody('payout_ready')).toThrow('Cannot start KYC from state: payout_ready');
  });

  it('throws for active state', () => {
    expect(() => startKycSessionBody('active')).toThrow('Cannot start KYC from state: active');
  });
});

describe('pollKycStatusBody', () => {
  it('kyc_submitted + approved → kyc_approved', () => {
    const result = pollKycStatusBody('kyc_submitted', 'approved');
    expect(result.nextState).toBe('kyc_approved');
    expect(result.kycStatus).toBe('approved');
  });

  it('kyc_submitted + rejected → kyc_required', () => {
    const result = pollKycStatusBody('kyc_submitted', 'rejected');
    expect(result.nextState).toBe('kyc_required');
    expect(result.kycStatus).toBe('rejected');
  });

  it('kyc_submitted + pending → no state change', () => {
    const result = pollKycStatusBody('kyc_submitted', 'pending');
    expect(result.nextState).toBe('kyc_submitted');
    expect(result.kycStatus).toBe('pending');
  });

  it('kyc_submitted + submitted → no state change', () => {
    const result = pollKycStatusBody('kyc_submitted', 'submitted');
    expect(result.nextState).toBe('kyc_submitted');
    expect(result.kycStatus).toBe('submitted');
  });

  it('kyc_required + approved → no state change', () => {
    const result = pollKycStatusBody('kyc_required', 'approved');
    expect(result.nextState).toBe('kyc_required');
    expect(result.kycStatus).toBe('approved');
  });

  it('kyc_required + rejected → no state change', () => {
    const result = pollKycStatusBody('kyc_required', 'rejected');
    expect(result.nextState).toBe('kyc_required');
    expect(result.kycStatus).toBe('rejected');
  });

  it('pending + approved → no state change', () => {
    const result = pollKycStatusBody('pending', 'approved');
    expect(result.nextState).toBe('pending');
    expect(result.kycStatus).toBe('approved');
  });
});
