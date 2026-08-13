/**
 * onboarding-service — tests.
 *
 * Per Wave 9 §S9.8 acceptance: services ship with at least one test
 * that asserts the public shape and the offline fallback.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOnboarding,
  submitIdentity,
  submitPayout,
  submitTax,
  __test,
  type OnboardingState,
} from './onboarding-service';

afterEach(() => {
  __test.STORE.clear();
  vi.restoreAllMocks();
});

const WORKSPACE = 'ws-onboarding-test';

describe('onboarding-service (S9.8)', () => {
  it('getOnboarding seeds an empty state for a new workspace', async () => {
    const state = await getOnboarding(WORKSPACE);
    expect(state.workspace_id).toBe(WORKSPACE);
    expect(state.current_step).toBe('identity');
    expect(state.completed).toEqual([]);
    expect(state.identity.verified).toBe(false);
    expect(state.payout.method).toBe('stripe');
    expect(state.tax.id_type).toBe('none');
    expect(state.tax.treaty).toBe(false);
  });

  it('submitIdentity advances the wizard to the payout step', async () => {
    const seeded = await getOnboarding(WORKSPACE);
    const next = await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    expect(next.identity.verified).toBe(true);
    expect(next.identity.persona_id).toBe('persona_abc');
    expect(next.identity.legal_name).toBe('Ada Lovelace');
    expect(next.identity.country).toBe('GB');
    expect(next.completed).toContain('identity');
    expect(next.current_step).toBe('payout');
    expect(seeded.current_step).toBe('identity');
  });

  it('submitPayout advances to the tax step', async () => {
    await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    const next = await submitPayout(WORKSPACE, {
      method: 'stripe',
      stripe_id: 'acct_test_1234',
    });
    expect(next.payout.method).toBe('stripe');
    expect(next.payout.stripe_id).toBe('acct_test_1234');
    expect(next.payout.last4).toBeUndefined();
    expect(next.payout.paypal_email).toBeUndefined();
    expect(next.completed).toEqual(['identity', 'payout']);
    expect(next.current_step).toBe('tax');
  });

  it('submitPayout captures bank last4 and paypal email per method', async () => {
    await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    const bank = await submitPayout(WORKSPACE, {
      method: 'bank',
      last4: '4242',
    });
    expect(bank.payout.method).toBe('bank');
    expect(bank.payout.last4).toBe('4242');
    expect(bank.payout.stripe_id).toBeUndefined();

    const paypal = await submitPayout(WORKSPACE, {
      method: 'paypal',
      paypal_email: '[email protected]',
    });
    expect(paypal.payout.method).toBe('paypal');
    expect(paypal.payout.paypal_email).toBe('[email protected]');
    expect(paypal.payout.last4).toBeUndefined();
    expect(paypal.payout.stripe_id).toBeUndefined();
  });

  it('submitTax advances to the listing step', async () => {
    await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    await submitPayout(WORKSPACE, {
      method: 'stripe',
      stripe_id: 'acct_test_1234',
    });
    const next = await submitTax(WORKSPACE, {
      country: 'GB',
      id_type: 'vat',
      id_value: 'GB123456789',
      treaty: false,
    });
    expect(next.tax.country).toBe('GB');
    expect(next.tax.id_type).toBe('vat');
    expect(next.tax.id_value).toBe('GB123456789');
    expect(next.tax.treaty).toBe(false);
    expect(next.completed).toEqual(['identity', 'payout', 'tax']);
    expect(next.current_step).toBe('listing');
  });

  it('submitTax with id_type "none" drops the id_value', async () => {
    await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    await submitPayout(WORKSPACE, {
      method: 'stripe',
      stripe_id: 'acct_test_1234',
    });
    const next = await submitTax(WORKSPACE, {
      country: 'US',
      id_type: 'none',
      treaty: false,
    });
    expect(next.tax.id_type).toBe('none');
    expect(next.tax.id_value).toBeUndefined();
  });

  it('falls back to in-memory state advancement when fetcher throws', async () => {
    // Force fetcher to throw. The submit functions must still return
    // a coherent OnboardingState so the wizard remains usable offline.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network unreachable');
    }) as typeof fetch;
    try {
      const seeded = await getOnboarding(WORKSPACE);
      expect(seeded.current_step).toBe('identity');
      const next = await submitIdentity(WORKSPACE, {
        legal_name: 'Offline Tester',
        country: 'US',
        dob: '1990-01-01',
        persona_id: 'persona_offline',
      });
      expect(next.identity.verified).toBe(true);
      expect(next.completed).toContain('identity');
      expect(next.current_step).toBe('payout');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the online path when fetcher resolves', async () => {
    const upstream: OnboardingState = {
      workspace_id: WORKSPACE,
      current_step: 'payout',
      identity: {
        verified: true,
        persona_id: 'persona_remote',
        legal_name: 'Remote User',
        country: 'US',
      },
      payout: { method: 'stripe' },
      tax: { country: '', id_type: 'none', treaty: false },
      completed: ['identity'],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(upstream), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    try {
      const state = await submitIdentity(WORKSPACE, {
        legal_name: 'Remote User',
        country: 'US',
        dob: '1990-01-01',
        persona_id: 'persona_remote',
      });
      expect(state.identity.persona_id).toBe('persona_remote');
      expect(state.completed).toEqual(['identity']);
      expect(state.current_step).toBe('payout');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps state idempotent when submitting the same step twice', async () => {
    await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    const next = await submitIdentity(WORKSPACE, {
      legal_name: 'Ada Lovelace',
      country: 'GB',
      dob: '1815-12-10',
      persona_id: 'persona_abc',
    });
    expect(next.completed.filter((s) => s === 'identity')).toHaveLength(1);
    expect(next.current_step).toBe('payout');
  });
});