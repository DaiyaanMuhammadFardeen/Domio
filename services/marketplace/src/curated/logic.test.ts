/**
 * Curated / brand-lock logic tests (Phase 19 Wave 4 — WS-MKT-5).
 *
 * Tests for brand-lock state machine and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateBrandLockState,
  validateBrandLockInput,
  assertNotDenied,
  resolveVisibleListingIds,
  getOverridePrice,
} from './logic.js';
import { InvalidBrandLockError, BrandLockDeniedError } from './types.js';
import type { BrandLockedListing } from './types.js';

function makeBrandLock(overrides: Partial<BrandLockedListing> = {}): BrandLockedListing {
  return {
    id: overrides.id ?? 'lock-1',
    workspaceId: overrides.workspaceId ?? 'ws-1',
    brandKitId: overrides.brandKitId ?? 'brand-1',
    marketplaceListingId: overrides.marketplaceListingId ?? 'listing-1',
    state: overrides.state ?? 'allow',
    overridePriceCents: overrides.overridePriceCents ?? null,
    notes: overrides.notes ?? null,
    auditActorId: overrides.auditActorId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    createdBy: overrides.createdBy ?? null,
    updatedBy: overrides.updatedBy ?? null,
  };
}

describe('validateBrandLockState', () => {
  it('accepts allow', () => {
    expect(validateBrandLockState('allow')).toBe(true);
  });

  it('accepts deny', () => {
    expect(validateBrandLockState('deny')).toBe(true);
  });

  it('accepts override', () => {
    expect(validateBrandLockState('override')).toBe(true);
  });

  it('throws for invalid state', () => {
    expect(() => validateBrandLockState('invalid')).toThrow(InvalidBrandLockError);
  });

  it('throws for empty string', () => {
    expect(() => validateBrandLockState('')).toThrow(InvalidBrandLockError);
  });
});

describe('validateBrandLockInput', () => {
  it('accepts valid input', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: 'brand-1',
      marketplaceListingId: 'listing-1',
      state: 'allow',
    })).not.toThrow();
  });

  it('throws for missing workspaceId', () => {
    expect(() => validateBrandLockInput({
      workspaceId: '',
      brandKitId: 'brand-1',
      marketplaceListingId: 'listing-1',
      state: 'allow',
    })).toThrow('workspaceId is required');
  });

  it('throws for missing brandKitId', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: '',
      marketplaceListingId: 'listing-1',
      state: 'allow',
    })).toThrow('brandKitId is required');
  });

  it('throws for missing marketplaceListingId', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: 'brand-1',
      marketplaceListingId: '',
      state: 'allow',
    })).toThrow('marketplaceListingId is required');
  });

  it('throws for invalid state', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: 'brand-1',
      marketplaceListingId: 'listing-1',
      state: 'invalid',
    })).toThrow(InvalidBrandLockError);
  });

  it('throws for negative overridePriceCents', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: 'brand-1',
      marketplaceListingId: 'listing-1',
      state: 'override',
      overridePriceCents: -100,
    })).toThrow('overridePriceCents must be a non-negative number');
  });

  it('accepts null overridePriceCents', () => {
    expect(() => validateBrandLockInput({
      workspaceId: 'ws-1',
      brandKitId: 'brand-1',
      marketplaceListingId: 'listing-1',
      state: 'allow',
      overridePriceCents: null,
    })).not.toThrow();
  });
});

describe('assertNotDenied', () => {
  it('does nothing when no lock exists', () => {
    expect(() => assertNotDenied([], 'ws-1', 'brand-1', 'listing-1')).not.toThrow();
  });

  it('does nothing when lock is allow', () => {
    const locks = [makeBrandLock({ state: 'allow' })];
    expect(() => assertNotDenied(locks, 'ws-1', 'brand-1', 'listing-1')).not.toThrow();
  });

  it('does nothing when lock is override', () => {
    const locks = [makeBrandLock({ state: 'override' })];
    expect(() => assertNotDenied(locks, 'ws-1', 'brand-1', 'listing-1')).not.toThrow();
  });

  it('throws BrandLockDeniedError when lock is deny', () => {
    const locks = [makeBrandLock({ state: 'deny' })];
    expect(() => assertNotDenied(locks, 'ws-1', 'brand-1', 'listing-1')).toThrow(BrandLockDeniedError);
  });

  it('does nothing for different workspace', () => {
    const locks = [makeBrandLock({ state: 'deny', workspaceId: 'ws-2' })];
    expect(() => assertNotDenied(locks, 'ws-1', 'brand-1', 'listing-1')).not.toThrow();
  });
});

describe('resolveVisibleListingIds', () => {
  it('returns all listing ids for allow/override locks', () => {
    const locks = [
      makeBrandLock({ marketplaceListingId: 'l1', state: 'allow' }),
      makeBrandLock({ marketplaceListingId: 'l2', state: 'override' }),
      makeBrandLock({ marketplaceListingId: 'l3', state: 'deny' }),
    ];
    const visible = resolveVisibleListingIds(locks);
    expect(visible).toEqual(['l1', 'l2']);
  });

  it('returns empty array for all deny locks', () => {
    const locks = [
      makeBrandLock({ marketplaceListingId: 'l1', state: 'deny' }),
    ];
    const visible = resolveVisibleListingIds(locks);
    expect(visible).toEqual([]);
  });

  it('returns empty array for empty locks', () => {
    const visible = resolveVisibleListingIds([]);
    expect(visible).toEqual([]);
  });
});

describe('getOverridePrice', () => {
  it('returns override price for override lock', () => {
    const locks = [
      makeBrandLock({ marketplaceListingId: 'l1', state: 'override', overridePriceCents: 999 }),
    ];
    expect(getOverridePrice(locks, 'l1')).toBe(999);
  });

  it('returns null for allow lock', () => {
    const locks = [
      makeBrandLock({ marketplaceListingId: 'l1', state: 'allow' }),
    ];
    expect(getOverridePrice(locks, 'l1')).toBeNull();
  });

  it('returns null when no lock found', () => {
    expect(getOverridePrice([], 'l1')).toBeNull();
  });
});
