/**
 * Payment provider tests (Phase 19 Wave 2).
 *
 * Tests for Stripe/BKash/Nagad sandbox providers: createCheckout,
 * verifyWebhook, and provider_intent_id prefix validation.
 */

import { describe, it, expect } from 'vitest';
import { StripeSandboxProvider, BkashSandboxProvider, NagadSandboxProvider } from './providers.js';

describe('StripeSandboxProvider', () => {
  const provider = new StripeSandboxProvider();

  it('has correct name', () => {
    expect(provider.name).toBe('stripe');
  });

  it('createCheckout returns provider_intent_id with pi_ prefix', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 1000,
      currency: 'USD',
      idempotency_key: 'idem-1',
      success_url: undefined,
      cancel_url: undefined,
    });
    expect(result.provider_intent_id).toMatch(/^pi_/);
    expect(result.status).toBe('pending');
  });

  it('createCheckout includes checkout_url when success_url provided', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 1000,
      currency: 'USD',
      idempotency_key: 'idem-2',
      success_url: 'https://example.com/success',
      cancel_url: undefined,
    });
    expect(result.checkout_url).toContain('https://example.com/success');
    expect(result.checkout_url).toContain('session_id=');
  });

  it('createCheckout returns undefined checkout_url when no success_url', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 1000,
      currency: 'USD',
      idempotency_key: 'idem-3',
      success_url: undefined,
      cancel_url: undefined,
    });
    expect(result.checkout_url).toBeUndefined();
  });

  it('verifyWebhook returns true for non-empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), 'sig_abc')).toBe(true);
  });

  it('verifyWebhook returns false for empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), '')).toBe(false);
  });
});

describe('BkashSandboxProvider', () => {
  const provider = new BkashSandboxProvider();

  it('has correct name', () => {
    expect(provider.name).toBe('bkash');
  });

  it('createCheckout returns provider_intent_id with bk_ prefix', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 500,
      currency: 'BDT',
      idempotency_key: 'idem-1',
      success_url: undefined,
      cancel_url: undefined,
    });
    expect(result.provider_intent_id).toMatch(/^bk_/);
    expect(result.status).toBe('pending');
  });

  it('createCheckout includes checkout_url when success_url provided', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 500,
      currency: 'BDT',
      idempotency_key: 'idem-2',
      success_url: 'https://example.com/bkash/success',
      cancel_url: undefined,
    });
    expect(result.checkout_url).toContain('https://example.com/bkash/success');
    expect(result.checkout_url).toContain('payment_id=');
  });

  it('verifyWebhook returns true for non-empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), 'bkash_sig')).toBe(true);
  });

  it('verifyWebhook returns false for empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), '')).toBe(false);
  });
});

describe('NagadSandboxProvider', () => {
  const provider = new NagadSandboxProvider();

  it('has correct name', () => {
    expect(provider.name).toBe('nagad');
  });

  it('createCheckout returns provider_intent_id with ng_ prefix', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 750,
      currency: 'BDT',
      idempotency_key: 'idem-1',
      success_url: undefined,
      cancel_url: undefined,
    });
    expect(result.provider_intent_id).toMatch(/^ng_/);
    expect(result.status).toBe('pending');
  });

  it('createCheckout includes checkout_url when success_url provided', async () => {
    const result = await provider.createCheckout({
      listing_id: 'l1',
      buyer_id: 'b1',
      gross_cents: 750,
      currency: 'BDT',
      idempotency_key: 'idem-2',
      success_url: 'https://example.com/nagad/success',
      cancel_url: undefined,
    });
    expect(result.checkout_url).toContain('https://example.com/nagad/success');
    expect(result.checkout_url).toContain('payment_token=');
  });

  it('verifyWebhook returns true for non-empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), 'nagad_sig')).toBe(true);
  });

  it('verifyWebhook returns false for empty signature', () => {
    expect(provider.verifyWebhook(Buffer.from('{}'), '')).toBe(false);
  });
});
