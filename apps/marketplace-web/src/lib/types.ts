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
