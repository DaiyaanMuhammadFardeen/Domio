/**
 * Marketplace listing service.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 */

import type { MarketplaceListing } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface ListingListResponse {
  readonly items: ReadonlyArray<MarketplaceListing>;
  readonly total: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`listing-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listMarketplaceListings(params?: {
  status?: string;
  seller_id?: string;
}): Promise<ListingListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.seller_id) qs.set('seller_id', params.seller_id);
  const query = qs.toString();
  return apiFetch<ListingListResponse>(`/v1/marketplace/listings${query ? `?${query}` : ''}`);
}

export async function getMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  return apiFetch<MarketplaceListing>(`/v1/marketplace/listings/${encodeURIComponent(listingId)}`);
}
