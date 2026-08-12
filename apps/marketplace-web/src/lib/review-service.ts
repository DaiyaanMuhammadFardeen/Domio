/**
 * Marketplace review service.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 */

import type { Review } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface ReviewListResponse {
  readonly items: ReadonlyArray<Review>;
  readonly total: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`review-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listMarketplaceReviews(listingId: string): Promise<ReviewListResponse> {
  return apiFetch<ReviewListResponse>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews`,
  );
}