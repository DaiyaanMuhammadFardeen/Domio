/**
 * Brand-lock curation logic (Phase 19 Wave 4 — WS-MKT-5).
 *
 * Pure logic for brand-locked marketplace curation.
 * No I/O, no side effects.
 */

import type { BrandLockState, BrandLockedListing } from './types.js';
import { InvalidBrandLockError, BrandLockDeniedError } from './types.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_STATES: readonly BrandLockState[] = ['allow', 'deny', 'override'];

/**
 * Validate that a brand-lock state is allowed.
 */
export function validateBrandLockState(state: string): state is BrandLockState {
  if (!VALID_STATES.includes(state as BrandLockState)) {
    throw new InvalidBrandLockError(
      `Invalid brand-lock state: '${state}'. Must be one of: ${VALID_STATES.join(', ')}`,
    );
  }
  return true;
}

/**
 * Validate brand-lock creation input.
 */
export function validateBrandLockInput(input: {
  workspaceId: string;
  brandKitId: string;
  marketplaceListingId: string;
  state: string;
  overridePriceCents?: number | null;
  notes?: string | null;
}): void {
  if (!input.workspaceId) {
    throw new InvalidBrandLockError('workspaceId is required');
  }
  if (!input.brandKitId) {
    throw new InvalidBrandLockError('brandKitId is required');
  }
  if (!input.marketplaceListingId) {
    throw new InvalidBrandLockError('marketplaceListingId is required');
  }
  validateBrandLockState(input.state);
  if (input.overridePriceCents !== null && input.overridePriceCents !== undefined) {
    if (typeof input.overridePriceCents !== 'number' || input.overridePriceCents < 0) {
      throw new InvalidBrandLockError('overridePriceCents must be a non-negative number');
    }
  }
}

// ---------------------------------------------------------------------------
// Direct-API bypass guard
// ---------------------------------------------------------------------------

/**
 * Check if a brand lock exists with state 'deny' for the given
 * (workspaceId, brandKitId, marketplaceListingId). If so, throws
 * BrandLockDeniedError — this is the direct-API-bypass guard.
 */
export function assertNotDenied(
  locks: readonly BrandLockedListing[],
  workspaceId: string,
  brandKitId: string,
  marketplaceListingId: string,
): void {
  const lock = locks.find(
    l =>
      l.workspaceId === workspaceId &&
      l.brandKitId === brandKitId &&
      l.marketplaceListingId === marketplaceListingId,
  );
  if (lock && lock.state === 'deny') {
    throw new BrandLockDeniedError(marketplaceListingId, brandKitId);
  }
}

// ---------------------------------------------------------------------------
// Curated listing resolution
// ---------------------------------------------------------------------------

/**
 * Given a list of brand-locked listings for a brand-kit, resolve which
 * marketplace listing IDs are visible. 'allow' and 'override' pass through;
 * 'deny' filters out.
 */
export function resolveVisibleListingIds(
  locks: readonly BrandLockedListing[],
): string[] {
  return locks
    .filter(l => l.state !== 'deny')
    .map(l => l.marketplaceListingId);
}

/**
 * Get the override price for a listing in a brand-kit context.
 * Returns null if no override exists.
 */
export function getOverridePrice(
  locks: readonly BrandLockedListing[],
  marketplaceListingId: string,
): number | null {
  const lock = locks.find(
    l => l.marketplaceListingId === marketplaceListingId && l.state === 'override',
  );
  return lock?.overridePriceCents ?? null;
}
