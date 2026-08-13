/**
 * Tests for Wave 9 §S9.4 — Payout service settings primitives.
 */

import { describe, expect, it } from 'vitest';
import { getPayoutSettings, updatePayoutSettings } from './payout-service';

describe('payout-service (S9.4)', () => {
  it('getPayoutSettings returns default settings for a new creator', async () => {
    const settings = await getPayoutSettings('creator-pay-1');
    expect(settings.creator_id).toBe('creator-pay-1');
    expect(settings.method).toBe('stripe-connect');
    expect(settings.schedule).toBe('monthly');
    expect(settings.min_payout_cents).toBe(5000);
    expect(typeof settings.updated_at_ms).toBe('number');
  });

  it('updatePayoutSettings persists changes', async () => {
    const updated = await updatePayoutSettings('creator-pay-2', {
      method: 'bank-transfer',
      schedule: 'weekly',
      bank_account_last4: '1234',
      min_payout_cents: 2500,
    });
    expect(updated.method).toBe('bank-transfer');
    expect(updated.schedule).toBe('weekly');
    expect(updated.bank_account_last4).toBe('1234');
    expect(updated.stripe_connect_id).toBeNull();
    expect(updated.paypal_email).toBeNull();
    expect(updated.min_payout_cents).toBe(2500);

    const refetched = await getPayoutSettings('creator-pay-2');
    expect(refetched.method).toBe('bank-transfer');
    expect(refetched.schedule).toBe('weekly');
    expect(refetched.bank_account_last4).toBe('1234');
  });

  it('schedule changes to monthly', async () => {
    const updated = await updatePayoutSettings('creator-pay-3', {
      method: 'paypal',
      schedule: 'monthly',
      paypal_email: '[email protected]',
      min_payout_cents: 1000,
    });
    expect(updated.schedule).toBe('monthly');
    expect(updated.method).toBe('paypal');
    expect(updated.paypal_email).toBe('[email protected]');
  });
});
