/* ── Marketplace types (mirrors contracts/openapi/v1/marketplace-service.yaml) ─── */

export type ListingKind = 'component' | 'template' | 'theme' | 'sticker_pack' | 'icon_pack';
export type PriceModel = 'free' | 'one_time' | 'subscription' | 'team_seats' | 'enterprise_quote';
export type ListingStatus = 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';
export type PaymentProvider = 'stripe' | 'bkash' | 'nagad';
export type PurchaseStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';

export interface MarketplaceListing {
  id: string;
  catalog_id: string;
  seller_id: string;
  title: string;
  description?: string;
  status: ListingStatus;
  is_free: boolean;
  price_cents: number;
  currency: string;
  tags?: string[];
  preview?: {
    poster_ref?: string;
    loop_ref?: string;
  };
  published_at_ms?: number;
  deprecated_at_ms?: number;
  version?: string;
  created_at: number;
  updated_at: number;
}

export interface MarketplaceListingWithMeta extends MarketplaceListing {
  /** Frontend-enriched fields (may come from joined data) */
  kind?: ListingKind;
  price_model?: PriceModel;
  slug?: string;
  creator_name?: string;
  creator_avatar?: string;
  rating_avg?: number;
  rating_count?: number;
  download_count?: number;
}

export interface ListingVersion {
  version: string;
  changelog: string;
  created_at: number;
  created_by: string;
}

export interface ChangelogEntry {
  version: string;
  changelog: string;
  created_at: number;
}

export interface Review {
  id: string;
  listing_id: string;
  reviewer_id: string;
  rating: number;
  body: string;
  status: 'queued' | 'accepted' | 'auto_flagged' | 'removed';
  verified_buyer: boolean;
  created_at: number;
}

export interface CuratedListing {
  listing_id: string;
  title: string;
  slug: string;
  is_free: boolean;
  price_cents: number;
  currency: string;
  override_price_cents?: number | null;
  brand_locked_state: 'allow' | 'override';
}

export interface PurchaseInitiation {
  purchase_id: string;
  provider: PaymentProvider;
  provider_intent_id?: string;
  checkout_url?: string | null;
  status: PurchaseStatus;
  expires_at: number;
}

export interface ErrorBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

/* ── Frontend filter state ──────────────────────────────────────────── */

export interface ListingFilters {
  kind?: ListingKind;
  price_model?: PriceModel;
  search?: string;
  sort?: 'newest' | 'popular' | 'price_asc' | 'price_desc' | 'rating';
}

/* ── Listing card view model ────────────────────────────────────────── */

export interface ListingCardVM {
  id: string;
  slug: string;
  title: string;
  kind: ListingKind;
  price_cents: number;
  currency: string;
  is_free: boolean;
  price_model: PriceModel;
  creator_name: string;
  creator_avatar?: string;
  rating_avg: number;
  rating_count: number;
  download_count: number;
  poster_url?: string | undefined;
  tags: string[];
  created_at: number;
}

/* ── Wave 9 S9.1 — Faceted search & checkout types ─────────────────── */

export type SearchSort =
  | 'relevance'
  | 'newest'
  | 'top-rated'
  | 'most-downloaded'
  | 'price-asc'
  | 'price-desc';

export type FacetKey = 'kind' | 'theme' | 'color' | 'language' | 'price' | 'rating';

export interface SearchFacets {
  readonly kind: ReadonlyArray<{ readonly value: ListingKind; readonly count: number }>;
  readonly theme: ReadonlyArray<{ readonly value: string; readonly count: number }>;
  readonly color: ReadonlyArray<{ readonly value: string; readonly count: number }>;
  readonly language: ReadonlyArray<{ readonly value: string; readonly count: number }>;
  readonly price: { readonly free: number; readonly paid: number };
  readonly rating: ReadonlyArray<{ readonly value: number; readonly count: number }>;
}

export interface SearchQuery {
  readonly q?: string;
  readonly kind?: ListingKind;
  readonly theme?: string;
  readonly color?: string;
  readonly language?: string;
  readonly price_min_cents?: number;
  readonly price_max_cents?: number;
  readonly min_rating?: number;
  readonly sort?: SearchSort;
  readonly page?: number;
  readonly page_size?: number;
}

export interface SearchResult {
  readonly items: ReadonlyArray<MarketplaceListing>;
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
  readonly facets: SearchFacets;
}

export interface CartLine {
  readonly listing_id: string;
  readonly title: string;
  readonly price_cents: number;
  readonly currency: string;
  readonly quantity: number;
  readonly price_model: PriceModel;
}

export interface BillingAddress {
  readonly name: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postal_code: string;
  readonly country: string;
}

export interface CheckoutDraft {
  readonly lines: ReadonlyArray<CartLine>;
  readonly billing: BillingAddress | null;
  readonly tax_cents: number;
  readonly subtotal_cents: number;
  readonly total_cents: number;
  readonly currency: string;
  readonly provider: PaymentProvider;
}

export interface Receipt {
  readonly purchase_id: string;
  readonly lines: ReadonlyArray<CartLine>;
  readonly subtotal_cents: number;
  readonly tax_cents: number;
  readonly total_cents: number;
  readonly currency: string;
  readonly provider: PaymentProvider;
  readonly billing: BillingAddress;
  readonly issued_at_ms: number;
  readonly receipt_pdf_url: string;
}

export interface LibraryEntry {
  readonly listing_id: string;
  readonly title: string;
  readonly version: string;
  readonly installed_at_ms: number | null;
  readonly latest_version: string;
  readonly update_available: boolean;
  readonly license_terms: string;
  readonly download_url: string;
}
