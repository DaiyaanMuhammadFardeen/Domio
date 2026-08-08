/**
 * Payment provider types (Phase 19 Wave 2).
 *
 * Provider-agnostic interfaces for checkout and webhook verification.
 */

// ---------------------------------------------------------------------------
// Payment Provider Interface
// ---------------------------------------------------------------------------

export interface CreateCheckoutInput {
  readonly listing_id: string;
  readonly buyer_id: string;
  readonly gross_cents: number;
  readonly currency: string;
  readonly idempotency_key: string;
  readonly success_url: string | undefined;
  readonly cancel_url: string | undefined;
}

export interface CreateCheckoutResult {
  readonly provider_intent_id: string;
  readonly checkout_url: string | undefined;
  readonly status: 'pending' | 'succeeded' | 'failed';
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhook(rawBody: Buffer | string, signature: string): boolean;
}

// ---------------------------------------------------------------------------
// Webhook Event Types
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | 'checkout.session.completed'
  | 'checkout.session.expired'
  | 'payment.completed'
  | 'payment.failed';

// ---------------------------------------------------------------------------
// Sandbox flag
// ---------------------------------------------------------------------------

export const SANDBOX_MODE = process.env.MARKETPLACE_PAYMENTS_SANDBOX ?? 'true';
