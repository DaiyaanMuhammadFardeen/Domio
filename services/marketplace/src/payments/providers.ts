/**
 * Payment provider implementations (Phase 19 Wave 2).
 *
 * In-memory sandbox implementations for Stripe, BKash, and Nagad.
 * No real API keys; deterministic provider_intent_id with prefixes.
 *
 * SANDBOX semantics:
 * - Stripe: provider_intent_id = 'pi_' + ulid-ish
 * - BKash:  provider_intent_id = 'bk_' + ulid-ish
 * - Nagad:  provider_intent_id = 'ng_' + ulid-ish
 *
 * verifyWebhook:
 * - Stripe: checks 'stripe-signature' header is non-empty
 * - BKash: checks 'x-bkash-signature' header is present
 * - Nagad: checks 'x-nagad-signature' header is present
 *
 * When MARKETPLACE_PAYMENTS_SANDBOX !== 'true', providers still use sandbox
 * semantics. Real vendor adapters are a LATER WAVE (out of scope).
 */

import { randomBytes } from 'crypto';
import type { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult } from './types.js';

// ---------------------------------------------------------------------------
// ULID-ish ID generator
// ---------------------------------------------------------------------------

function generateId(): string {
  const bytes = randomBytes(16);
  // Crockford base32 encoding for ULID-ish format
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  for (let i = 0; i < 26; i++) {
    const byteIndex = i % bytes.length;
    result += chars[(bytes[byteIndex]! >> (i % 2 === 0 ? 0 : 4)) & 0x1f];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stripe Sandbox Provider
// ---------------------------------------------------------------------------

export class StripeSandboxProvider implements PaymentProvider {
  readonly name = 'stripe';

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const providerIntentId = `pi_${generateId()}`;
    return {
      provider_intent_id: providerIntentId,
      checkout_url: input.success_url
        ? `${input.success_url}?session_id=${providerIntentId}`
        : undefined,
      status: 'pending',
    };
  }

  verifyWebhook(_rawBody: Buffer | string, signature: string): boolean {
    // Sandbox: check stripe-signature header is non-empty
    return typeof signature === 'string' && signature.length > 0;
  }
}

// ---------------------------------------------------------------------------
// BKash Sandbox Provider
// ---------------------------------------------------------------------------

export class BkashSandboxProvider implements PaymentProvider {
  readonly name = 'bkash';

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const providerIntentId = `bk_${generateId()}`;
    return {
      provider_intent_id: providerIntentId,
      checkout_url: input.success_url
        ? `${input.success_url}?payment_id=${providerIntentId}`
        : undefined,
      status: 'pending',
    };
  }

  verifyWebhook(_rawBody: Buffer | string, signature: string): boolean {
    // Sandbox: check x-bkash-signature header is present
    return typeof signature === 'string' && signature.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Nagad Sandbox Provider
// ---------------------------------------------------------------------------

export class NagadSandboxProvider implements PaymentProvider {
  readonly name = 'nagad';

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const providerIntentId = `ng_${generateId()}`;
    return {
      provider_intent_id: providerIntentId,
      checkout_url: input.success_url
        ? `${input.success_url}?payment_token=${providerIntentId}`
        : undefined,
      status: 'pending',
    };
  }

  verifyWebhook(_rawBody: Buffer | string, signature: string): boolean {
    // Sandbox: check x-nagad-signature header is present
    return typeof signature === 'string' && signature.length > 0;
  }
}
