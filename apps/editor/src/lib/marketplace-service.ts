/**
 * marketplace-service — typed client for the editor's Insert →
 * Marketplace surface.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps the curated listings endpoint at `/v1/marketplace/curated` and
 * returns the page shape the editor's MarketplacePanel consumes. The
 * real marketplace-svc client will replace this with the generated
 * SDK once the contracts ship.
 */

export interface CuratedListingView {
  readonly listing_id: string;
  readonly title: string;
  readonly slug: string;
  readonly is_free: boolean;
  readonly price_cents: number;
  readonly currency: string;
  readonly override_price_cents: number | null;
  readonly brand_locked_state: 'allow' | 'override' | 'deny';
  /** Optional — may be added by future API revisions. */
  readonly kind?: string;
  readonly description?: string;
  readonly seller_name?: string;
  readonly version?: string;
  readonly poster_ref?: string;
}

export interface CuratedListingPage {
  readonly items: readonly CuratedListingView[];
  readonly total: number;
}

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

/**
 * Fetch a page of curated listings filtered by the active brand kit.
 *
 * @param brandKitId The brand kit ID (empty string means no brand filter).
 * @param limit      Page size (default 40).
 * @param offset     Page offset (default 0).
 * @param baseUrl    Override the API base URL (used in tests).
 */
export async function fetchCuratedListings(
  brandKitId: string,
  limit: number = 40,
  offset: number = 0,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<CuratedListingPage> {
  const params = new URLSearchParams({
    brand_kit_id: brandKitId,
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${baseUrl}/v1/marketplace/curated?${params}`);
  if (!res.ok) {
    throw new Error(`Marketplace API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<CuratedListingPage>;
}
