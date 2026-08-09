/**
 * Creator payout method logic tests (Phase 19 Wave 3).
 *
 * Tests for payout method creation and validation.
 */

import { describe, it, expect } from 'vitest';
import { validatePayoutMethodKind, createPayoutMethodBody, connectLinkBody } from './payout.js';

describe('validatePayoutMethodKind', () => {
  it('accepts stripe_connect', () => {
    expect(validatePayoutMethodKind('stripe_connect')).toBe(true);
  });

  it('accepts bkash', () => {
    expect(validatePayoutMethodKind('bkash')).toBe(true);
  });

  it('accepts nagad', () => {
    expect(validatePayoutMethodKind('nagad')).toBe(true);
  });

  it('accepts bank', () => {
    expect(validatePayoutMethodKind('bank')).toBe(true);
  });

  it('throws for invalid kind', () => {
    expect(() => validatePayoutMethodKind('paypal')).toThrow('Invalid payout method kind');
  });

  it('throws for empty kind', () => {
    expect(() => validatePayoutMethodKind('')).toThrow('Invalid payout method kind');
  });
});

describe('createPayoutMethodBody', () => {
  it('accepts valid input from kyc_approved state', () => {
    const result = createPayoutMethodBody('kyc_approved', 'stripe_connect', 'acct_123');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('stripe_connect');
  });

  it('accepts valid input from payout_ready state', () => {
    const result = createPayoutMethodBody('payout_ready', 'bkash', 'bk_123');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('bkash');
  });

  it('accepts valid input from active state', () => {
    const result = createPayoutMethodBody('active', 'nagad', 'ng_123');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('nagad');
  });

  it('throws for pending state', () => {
    expect(() => createPayoutMethodBody('pending', 'stripe_connect', 'acct_123')).toThrow('Cannot create payout method from state');
  });

  it('throws for profile_complete state', () => {
    expect(() => createPayoutMethodBody('profile_complete', 'stripe_connect', 'acct_123')).toThrow('Cannot create payout method from state');
  });

  it('throws for kyc_required state', () => {
    expect(() => createPayoutMethodBody('kyc_required', 'stripe_connect', 'acct_123')).toThrow('Cannot create payout method from state');
  });

  it('throws for kyc_submitted state', () => {
    expect(() => createPayoutMethodBody('kyc_submitted', 'stripe_connect', 'acct_123')).toThrow('Cannot create payout method from state');
  });

  it('throws for invalid kind', () => {
    expect(() => createPayoutMethodBody('kyc_approved', 'paypal', 'acct_123')).toThrow('Invalid payout method kind');
  });

  it('throws for empty external_account_id', () => {
    expect(() => createPayoutMethodBody('kyc_approved', 'stripe_connect', '')).toThrow('external_account_id is required');
  });

  it('throws for whitespace-only external_account_id', () => {
    expect(() => createPayoutMethodBody('kyc_approved', 'stripe_connect', '   ')).toThrow('external_account_id is required');
  });
});

describe('connectLinkBody', () => {
  it('accepts kyc_approved state', () => {
    const result = connectLinkBody('kyc_approved');
    expect(result.valid).toBe(true);
  });

  it('accepts payout_ready state', () => {
    const result = connectLinkBody('payout_ready');
    expect(result.valid).toBe(true);
  });

  it('accepts active state', () => {
    const result = connectLinkBody('active');
    expect(result.valid).toBe(true);
  });

  it('throws for pending state', () => {
    expect(() => connectLinkBody('pending')).toThrow('Cannot get payout connect link from state');
  });

  it('throws for profile_complete state', () => {
    expect(() => connectLinkBody('profile_complete')).toThrow('Cannot get payout connect link from state');
  });

  it('throws for kyc_required state', () => {
    expect(() => connectLinkBody('kyc_required')).toThrow('Cannot get payout connect link from state');
  });

  it('throws for kyc_submitted state', () => {
    expect(() => connectLinkBody('kyc_submitted')).toThrow('Cannot get payout connect link from state');
  });
});
