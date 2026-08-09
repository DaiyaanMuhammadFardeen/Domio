/**
 * Creator analytics service — shared types and errors (Phase 19 Wave 3).
 *
 * Domain types for creator analytics dashboards and statements.
 */

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface GeoCount {
  readonly country_code: string;
  readonly count: number;
}

export interface CreatorAnalytics {
  readonly creator_id: string;
  readonly period: string;
  readonly downloads: number;
  readonly installs: number;
  readonly mrr_cents: number;
  readonly conversion_rate: number; // 0..1
  readonly refund_rate: number;     // 0..1
  readonly top_geos: readonly GeoCount[];
  readonly computed_at: number;     // ts_ms
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type StatementKind = 'monthly' | 'yearly_1099k';

export interface StatementSummary {
  readonly statement_id: string;
  readonly creator_id: string;
  readonly period_month: string;
  readonly kind: StatementKind;
  readonly total_gross_cents: number;
  readonly total_fee_cents: number;
  readonly total_net_cents: number;
  readonly currency: string;
  readonly generated_at: number; // ts_ms
}

export interface StatementLineItem {
  readonly event_type: string;
  readonly count: number;
  readonly gross_cents: number;
  readonly net_cents: number;
}

// ---------------------------------------------------------------------------
// Raw row shapes from the DB (read-only queries against P06/P19 tables)
// ---------------------------------------------------------------------------

export interface RevenueEventRow {
  readonly id: string;
  readonly listing_id: string;
  readonly seller_id: string;
  readonly workspace_id: string;
  readonly currency: string;
  readonly gross_cents: number;
  readonly fee_cents: number;
  readonly net_cents: number;
  readonly payout_status: string;
  readonly period_month: string;
  readonly event_type: string;
}

export interface PaymentIntentRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly buyer_id: string;
  readonly listing_id: string;
  readonly purchase_id: string;
  readonly provider: string;
  readonly currency: string;
  readonly gross_cents: number;
  readonly fee_cents: number;
  readonly net_cents: number;
  readonly status: string;
}

export interface LicenseGrantRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string | null;
  readonly catalog_id: string;
  readonly version: string;
  readonly listing_id: string | null;
  readonly license_id: string;
  readonly seats: number;
  readonly signed_token: string;
  readonly issued_at_ms: number;
  readonly expires_at_ms: number;
}

// ---------------------------------------------------------------------------
// Domain event envelope
// ---------------------------------------------------------------------------

export interface CreatorAnalyticsEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class CreatorNotFoundError extends Error {
  readonly code = 'CREATOR_NOT_FOUND' as const;
  constructor(public readonly creatorId: string) {
    super(`Creator not found: ${creatorId}`);
    this.name = 'CreatorNotFoundError';
  }
}

export class StatementNotFoundError extends Error {
  readonly code = 'STATEMENT_NOT_FOUND' as const;
  constructor(public readonly statementId: string) {
    super(`Statement not found: ${statementId}`);
    this.name = 'StatementNotFoundError';
  }
}

export class InvalidPeriodError extends Error {
  readonly code = 'INVALID_PERIOD' as const;
  constructor(public readonly period: string) {
    super(`Invalid period format (expected YYYY-MM): ${period}`);
    this.name = 'InvalidPeriodError';
  }
}
