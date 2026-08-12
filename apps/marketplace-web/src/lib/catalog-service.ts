/**
 * Marketplace catalog service — curated listings + changelog.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 */

import type { ChangelogEntry } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CuratedListResponse {
  readonly items: ReadonlyArray<{
    readonly listing_id: string;
    readonly title: string;
    readonly slug: string;
    readonly is_free: boolean;
    readonly price_cents: number;
    readonly currency: string;
    readonly override_price_cents?: number | null;
    readonly brand_locked_state: string;
  }>;
  readonly total: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`catalog-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getCuratedMarketplaceListings(params?: {
  brand_kit_id?: string;
  limit?: number;
  offset?: number;
}): Promise<CuratedListResponse> {
  const qs = new URLSearchParams();
  if (params?.brand_kit_id) qs.set('brand_kit_id', params.brand_kit_id);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return apiFetch<CuratedListResponse>(
    `/v1/marketplace/curated${query ? `?${query}` : ''}`,
  );
}

export async function getMarketplaceListingChangelog(
  listingId: string,
): Promise<ReadonlyArray<ChangelogEntry>> {
  return apiFetch<ReadonlyArray<ChangelogEntry>>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/changelog`,
  );
}