/**
 * Creator console API types — based on contracts/openapi/v1/marketplace-service.yaml
 */

export interface MarketplaceListing {
  id: string;
  catalog_id: string;
  seller_id: string;
  title: string;
  description?: string;
  kind: 'component' | 'template' | 'theme' | 'sticker_pack' | 'icon_pack';
  status: 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';
  is_free: boolean;
  price_cents: number;
  currency: string;
  tags: string[];
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

export interface MarketplaceListingInput {
  catalog_id: string;
  seller_id: string;
  title: string;
  kind: 'component' | 'template' | 'theme' | 'sticker_pack' | 'icon_pack';
  license_id: string;
  description?: string;
  tags?: string[];
  price: {
    model: 'free' | 'one_time' | 'subscription' | 'team_seats' | 'enterprise_quote';
    price_cents: number;
    currency: string;
  };
}

export interface CreatorAnalytics {
  creator_id: string;
  period: string;
  downloads: number;
  installs: number;
  mrr_cents: number;
  conversion_rate: number;
  refund_rate: number;
  top_geos: Array<{
    country_code: string;
    installs: number;
  }>;
  listings: number;
  avg_rating: number;
  created_at_ms: number;
}

export interface StatementSummary {
  statement_id: string;
  creator_id: string;
  period_month: string;
  kind: 'monthly' | 'yearly_1099k';
  total_gross_cents: number;
  total_fee_cents: number;
  total_net_cents: number;
  currency: string;
  generated_at: number;
}

export interface CreatorProfile {
  user_id: string;
  display_name: string;
  slug: string;
  bio?: string;
  country_code?: string;
  payout_method?: string;
  payout_ready: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected' | 'expired';
  balance_cents: number;
  currency: string;
  onboarding_state: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface CreatorProfileUpdate {
  display_name?: string;
  bio?: string | null;
  country_code?: string | null;
  currency?: string;
}

export interface KycStatusResult {
  kyc_session_id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  onboarding_state: string;
}

export interface KycSessionStart {
  kyc_session_id: string;
  session_url: string;
}

export interface CreatorPayoutMethod {
  id: string;
  creator_id: string;
  kind: 'stripe_connect' | 'bkash' | 'nagad' | 'bank';
  verified: boolean;
  external_account_id: string;
  metadata?: Record<string, unknown>;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface PayoutConnectLink {
  connect_url: string;
  expires_at: number;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

// ---------------------------------------------------------------------------
// Wave 9 §S9.3 — Creator analytics (period, revenue series, top listings,
// geo distribution, conversion funnel).
// ---------------------------------------------------------------------------

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y';
export type AnalyticsBucket = 'day' | 'week' | 'month';

export interface RevenuePoint {
  readonly timestamp_ms: number;
  readonly revenue_cents: number;
  readonly refunds_cents: number;
}

export interface TopListing {
  readonly listing_id: string;
  readonly title: string;
  readonly revenue_cents: number;
  readonly units_sold: number;
  readonly conversion_rate: number;
}

export interface GeoBucket {
  readonly country_code: string;
  readonly country_name: string;
  readonly installs: number;
  readonly revenue_cents: number;
}

export interface ConversionFunnel {
  readonly views: number;
  readonly trial_starts: number;
  readonly purchases: number;
  readonly view_to_trial_rate: number;
  readonly trial_to_purchase_rate: number;
  readonly overall_conversion_rate: number;
}

// ---------------------------------------------------------------------------
// Wave 9 §S9.2 — Creator listing creation wizard
// ---------------------------------------------------------------------------

export type WizardStep = 'details' | 'media' | 'files' | 'pricing';

export type AssetKind =
  | 'cover'
  | 'gallery'
  | 'video'
  | 'component'
  | 'template'
  | 'sample-deck';

export type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed';

export interface AssetUpload {
  readonly id: string;
  readonly kind: AssetKind;
  readonly filename: string;
  readonly size_bytes: number;
  readonly status: UploadStatus;
  readonly progress_pct: number;
  readonly presigned_url: string | null;
  readonly uploaded_url: string | null;
  readonly error: string | null;
}

export interface WizardDetails {
  readonly title: string;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
  readonly category: ListingKind;
  readonly license_id: string;
}

export interface WizardPricing {
  readonly model: PriceModel;
  readonly price_cents: number;
  readonly currency: string;
  readonly subscription_interval: 'monthly' | 'yearly' | null;
  readonly royalty_bps: number | null;
}

export interface WizardDraft {
  readonly id: string;
  readonly step: WizardStep;
  readonly details: WizardDetails | null;
  readonly assets: ReadonlyArray<AssetUpload>;
  readonly pricing: WizardPricing | null;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export type ListingKind =
  | 'component'
  | 'template'
  | 'theme'
  | 'sticker_pack'
  | 'icon_pack';

export type PriceModel =
  | 'free'
  | 'one_time'
  | 'subscription'
  | 'team_seats'
  | 'enterprise_quote';

// ---------------------------------------------------------------------------
// Wave 9 §S9.4 — Statements + payouts.
// ---------------------------------------------------------------------------

export type StatementStatus = 'draft' | 'finalized' | 'paid' | 'disputed';

export interface StatementLine {
  readonly listing_id: string;
  readonly listing_title: string;
  readonly units: number;
  readonly gross_cents: number;
  readonly fees_cents: number;
  readonly refunds_cents: number;
  readonly net_cents: number;
}

export interface Statement {
  readonly id: string;
  readonly creator_id: string;
  readonly period_month: string; // YYYY-MM
  readonly status: StatementStatus;
  readonly lines: ReadonlyArray<StatementLine>;
  readonly gross_cents: number;
  readonly fees_cents: number;
  readonly refunds_cents: number;
  readonly net_cents: number;
  readonly currency: string;
  readonly generated_at_ms: number | null;
  readonly finalized_at_ms: number | null;
  readonly paid_at_ms: number | null;
  readonly pdf_url: string | null;
}

export type PayoutSchedule = 'weekly' | 'biweekly' | 'monthly' | 'manual';
export type PayoutMethod = 'bank-transfer' | 'stripe-connect' | 'paypal';

export interface PayoutSettings {
  readonly creator_id: string;
  readonly method: PayoutMethod;
  readonly schedule: PayoutSchedule;
  readonly bank_account_last4: string | null;
  readonly stripe_connect_id: string | null;
  readonly paypal_email: string | null;
  readonly min_payout_cents: number;
  readonly updated_at_ms: number;
}

export interface PayoutSettingsInput {
  readonly method: PayoutMethod;
  readonly schedule: PayoutSchedule;
  readonly bank_account_last4?: string;
  readonly stripe_connect_id?: string;
  readonly paypal_email?: string;
  readonly min_payout_cents: number;
}
