/**
 * Curated / brand-locked listing types (Phase 19 Wave 4 — WS-MKT-5).
 *
 * Types for brand-locked marketplace curation.
 * Table: brand_locked_listing (migration 0080).
 */

// ---------------------------------------------------------------------------
// Brand Lock State
// ---------------------------------------------------------------------------

export type BrandLockState = 'allow' | 'deny' | 'override';

// ---------------------------------------------------------------------------
// Brand Locked Listing
// ---------------------------------------------------------------------------

export interface BrandLockedListing {
  readonly id: string;
  readonly workspaceId: string;
  readonly brandKitId: string;
  readonly marketplaceListingId: string;
  readonly state: BrandLockState;
  readonly overridePriceCents: number | null;
  readonly notes: string | null;
  readonly auditActorId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BrandLockDeniedError extends Error {
  readonly code = 'BRAND_LOCK_DENIED' as const;
  constructor(
    public readonly listingId: string,
    public readonly brandKitId: string,
  ) {
    super(`Brand-lock denies listing ${listingId} for brand ${brandKitId}`);
    this.name = 'BrandLockDeniedError';
  }
}

export class InvalidBrandLockError extends Error {
  readonly code = 'INVALID_BRAND_LOCK' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBrandLockError';
  }
}

export class BrandLockNotFoundError extends Error {
  readonly code = 'BRAND_LOCK_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BrandLockNotFoundError';
  }
}
