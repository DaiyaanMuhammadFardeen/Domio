/**
 * Marketplace checkout service — initiates a purchase.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 */

import type { PurchaseInitiation } from './types';

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