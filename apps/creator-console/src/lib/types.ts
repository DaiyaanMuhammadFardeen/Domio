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
