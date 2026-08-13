/**
 * Marketplace checkout service — initiates a purchase.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 *
 * Wave 9 S9.1 — extended with createCheckoutDraft + confirmCheckout
 * for the multi-step checkout flow.
 */

import type {
  BillingAddress,
  CartLine,
  CheckoutDraft,
  PaymentProvider,
  PurchaseInitiation,
  Receipt,
} from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`checkout-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function createPurchase(
  listingId: string,
  input: {
    readonly listing_id: string;
    readonly provider: 'stripe' | 'bkash' | 'nagad';
    readonly currency: string;
    readonly idempotency_key: string;
    readonly quantity?: number;
    readonly success_url?: string;
    readonly cancel_url?: string;
  },
): Promise<PurchaseInitiation> {
  return apiFetch<PurchaseInitiation>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/purchase`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/* ── Wave 9 S9.1 ────────────────────────────────────────────────────── */

const TAX_RATE = 0.1;

function roundCents(n: number): number {
  return Math.round(n);
}

function computeTotals(lines: ReadonlyArray<CartLine>): {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
} {
  const subtotal = lines.reduce(
    (acc, l) => acc + l.price_cents * l.quantity,
    0,
  );
  const tax = roundCents(subtotal * TAX_RATE);
  const currency = lines[0]?.currency ?? 'USD';
  return {
    subtotal_cents: roundCents(subtotal),
    tax_cents: tax,
    total_cents: roundCents(subtotal + tax),
    currency,
  };
}

/**
 * Build a checkout draft from a cart + billing + provider.
 * Pure computation — no network call. The provider is locked in here
 * so the `Receipt` is tied to the same provider.
 */
export async function createCheckoutDraft(
  cart: ReadonlyArray<CartLine>,
  billing: BillingAddress,
  provider: PaymentProvider,
): Promise<CheckoutDraft> {
  const totals = computeTotals(cart);
  return {
    lines: cart,
    billing,
    tax_cents: totals.tax_cents,
    subtotal_cents: totals.subtotal_cents,
    total_cents: totals.total_cents,
    currency: totals.currency,
    provider,
  };
}

/**
 * Confirm a checkout draft. Simulates a ~800ms payment processor roundtrip
 * and returns a receipt with a deterministic purchase id derived from the
 * idempotency key.
 */
export async function confirmCheckout(
  draft: CheckoutDraft,
  idempotency_key: string,
): Promise<Receipt> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (!draft.billing) {
    throw new Error('checkout-service: billing required to confirm');
  }

  const purchaseId = `pur_${idempotency_key.slice(0, 12)}`;
  return {
    purchase_id: purchaseId,
    lines: draft.lines,
    subtotal_cents: draft.subtotal_cents,
    tax_cents: draft.tax_cents,
    total_cents: draft.total_cents,
    currency: draft.currency,
    provider: draft.provider,
    billing: draft.billing,
    issued_at_ms: Date.now(),
    receipt_pdf_url: `/api/receipts/${purchaseId}.pdf`,
  };
}
