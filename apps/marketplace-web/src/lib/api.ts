/**
 * Marketplace API client — plain fetch, no framework deps.
 * Follows the magic-link-landing pattern.
 */

import type {
  MarketplaceListing,
  ChangelogEntry,
  Review,
  PurchaseInitiation,
  ErrorBody,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080';

/* ── Generic fetch wrapper ──────────────────────────────────────────── */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: ErrorBody;
    try {
      body = await res.json();
    } catch {
      body = {
        type: 'about:blank',
        title: 'Network Error',
        status: res.status,
        detail: 'Could not parse error response.',
        instance: path,
      };
    }
    throw new ApiError(body);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  body: ErrorBody;

  constructor(body: ErrorBody) {
    super(body.detail);
    this.name = 'ApiError';
    this.body = body;
  }
}

/* ── Marketplace listings ───────────────────────────────────────────── */

export interface ListingListResponse {
  items: MarketplaceListing[];
  total: number;
}

export interface CuratedListResponse {
  items: Array<{
    listing_id: string;
    title: string;
    slug: string;
    is_free: boolean;
    price_cents: number;
    currency: string;
    override_price_cents?: number | null;
    brand_locked_state: string;
  }>;
  total: number;
}

/**
 * GET /v1/marketplace/listings — listMarketplaceListings
 */
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

/**
 * GET /v1/marketplace/listings/:id — getMarketplaceListing
 */
export async function getMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  return apiFetch<MarketplaceListing>(`/v1/marketplace/listings/${encodeURIComponent(listingId)}`);
}

/**
 * GET /v1/marketplace/curated — getCuratedMarketplaceListings
 */
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
  return apiFetch<CuratedListResponse>(`/v1/marketplace/curated${query ? `?${query}` : ''}`);
}

/* ── Changelog ──────────────────────────────────────────────────────── */

/**
 * GET /v1/marketplace/listings/:id/changelog — getMarketplaceListingChangelog
 */
export async function getMarketplaceListingChangelog(listingId: string): Promise<ChangelogEntry[]> {
  return apiFetch<ChangelogEntry[]>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/changelog`,
  );
}

/* ── Reviews ────────────────────────────────────────────────────────── */

export interface ReviewListResponse {
  items: Review[];
  total: number;
}

/**
 * GET /v1/marketplace/listings/:id/reviews — listMarketplaceReviews
 */
export async function listMarketplaceReviews(listingId: string): Promise<ReviewListResponse> {
  return apiFetch<ReviewListResponse>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews`,
  );
}

/* ── Purchase ───────────────────────────────────────────────────────── */

/**
 * POST /v1/marketplace/listings/:id/purchase — createPurchase
 */
export async function createPurchase(
  listingId: string,
  input: {
    listing_id: string;
    provider: 'stripe' | 'bkash' | 'nagad';
    currency: string;
    idempotency_key: string;
    quantity?: number;
    success_url?: string;
    cancel_url?: string;
  },
): Promise<PurchaseInitiation> {
  return apiFetch<PurchaseInitiation>(
    `/v1/marketplace/listings/${encodeURIComponent(listingId)}/purchase`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
