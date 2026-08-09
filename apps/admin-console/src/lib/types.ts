/**
 * TypeScript types derived from contracts/openapi/v1/marketplace-service.yaml.
 * Admin console uses a subset of the marketplace schemas.
 */

// ── Marketplace Listing ─────────────────────────────────────────────────
export interface MarketplaceListing {
  id: string;
  catalog_id: string;
  seller_id: string;
  title: string;
  description: string;
  status: 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';
  is_free: boolean;
  price_cents: number;
  currency: string;
  tags: string[];
  preview?: { poster_ref?: string; loop_ref?: string };
  published_at_ms?: number;
  deprecated_at_ms?: number;
  version?: string;
  created_at: number;
  updated_at: number;
}

// ── Brand Lock ──────────────────────────────────────────────────────────
export type BrandLockState = 'allow' | 'deny' | 'override';

export interface BrandLock {
  id: string;
  tenant_id: string;
  brand_kit_id: string;
  marketplace_listing_id: string;
  state: BrandLockState;
  override_price_cents: number | null;
  notes: string | null;
  created_at: number;
}

export interface BrandLockList {
  items: BrandLock[];
  total: number;
}

export interface BrandLockInput {
  tenant_id: string;
  brand_kit_id: string;
  marketplace_listing_id: string;
  state: BrandLockState;
  override_price_cents?: number;
  notes?: string;
}

// ── Curated Listing ─────────────────────────────────────────────────────
export interface CuratedListing {
  listing_id: string;
  title: string;
  slug: string;
  is_free: boolean;
  price_cents: number;
  currency: string;
  override_price_cents: number | null;
  brand_locked_state: 'allow' | 'override';
}

export interface CuratedListingPage {
  items: CuratedListing[];
  total: number;
}

// ── Takedown ────────────────────────────────────────────────────────────
export type TakedownKind = 'dmca' | 'trademark' | 'policy';
export type TakedownStatus =
  | 'received'
  | 'in_review'
  | 'confirmed'
  | 'dismissed'
  | 'counter_notice'
  | 'resolved';

export interface TakedownRequest {
  request_id: string;
  listing_id: string;
  claimant_id: string;
  kind: TakedownKind;
  evidence_url: string | null;
  statement: string;
  status: TakedownStatus;
  resolution_notes: string | null;
  submitted_at: number;
  resolved_at: number | null;
}

export interface TakedownRequestList {
  items: TakedownRequest[];
  total: number;
}

export interface ResolveTakedownInput {
  decision: 'confirmed' | 'dismissed';
  resolution_notes?: string;
}

export interface CounterNoticeInput {
  statement: string;
}

// ── Payout ──────────────────────────────────────────────────────────────
export interface PayoutPolicy {
  split_creator_bps: number;
  split_platform_bps: number;
  min_payout_cents: number;
  first_payout_hold_days: number;
  updated_at: number;
}

export type PayoutRunStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PayoutRun {
  id: string;
  period_month: string;
  status: PayoutRunStatus;
  total_creators: number;
  total_payout_cents: number;
  currency: string;
  created_at_ms: number;
  completed_at_ms: number | null;
}

// ── Problem Detail (RFC-7807) ───────────────────────────────────────────
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}
