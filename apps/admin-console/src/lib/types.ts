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

// ── Custom Domain ──────────────────────────────────────────────────────
//
// Per Wave 3 §S3.5 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
//
// Each tenant can register one or more custom domains for their viewer
// links. Verification is via CNAME DNS record pointing at
// `cname.domio.app`. SSL provisioning happens once `verified` flips to
// `true`. After that, share links for that tenant are rewritten to use
// the custom domain.

export type CustomDomainState =
  | 'pending_dns' // awaiting CNAME creation
  | 'verifying' // DNS detected, propagating
  | 'verified' // live + SSL provisioned
  | 'failed' // DNS error / validation failed
  | 'revoked'; // removed; links revert to deck.domio.app

export interface CustomDomain {
  id: string;
  tenant_id: string;
  workspace_id: string;
  /** Fully-qualified hostname, e.g. `decks.acme.com`. */
  hostname: string;
  state: CustomDomainState;
  /** Where the CNAME must point. */
  cname_target: string;
  /** Last DNS check timestamp (epoch ms). */
  last_checked_at_ms: number | null;
  /** Human-readable note about the latest check. */
  last_check_note: string | null;
  /** When the domain first went verified (epoch ms). */
  verified_at_ms: number | null;
  /** Free-form tags / project label for filtering. */
  label: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface CustomDomainList {
  items: CustomDomain[];
  total: number;
}

export interface CustomDomainInput {
  tenant_id: string;
  workspace_id: string;
  hostname: string;
  label?: string;
}

export interface CustomDomainVerifyResult {
  domain: CustomDomain;
  /** True when DNS resolves to the expected CNAME target. */
  cname_ok: boolean;
  /** True when an A record falls back to a Domio IP range. */
  a_record_ok: boolean;
  /** Diagnostic message from the verifier. */
  message: string;
}

// ── Problem Detail (RFC-7807) ───────────────────────────────────────────
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}
