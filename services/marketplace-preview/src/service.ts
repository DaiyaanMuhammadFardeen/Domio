/**
 * Theme marketplace preview service (Phase 07 #45).
 *
 * This service owns theme listing lifecycle, immutable bundle hashing,
 * license enforcement, a11y certification gates, install-to-draft, and
 * opt-in buyer sample reviews.  It never auto-applies a theme to a deck.
 */

import { createHash } from 'node:crypto';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';
import type {
  AssetLicenseStatus,
  ListingStatus,
  MarketplaceRepository,
  ThemeBundle,
  ThemeInstallRecord,
  ThemeListingRecord,
  ThemeReviewRecord,
} from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ListingNotFoundError extends Error {
  readonly code = 'THEME_LISTING_NOT_FOUND' as const;
  constructor(public readonly listingId: string) {
    super(`Theme listing ${listingId} not found`);
    this.name = 'ListingNotFoundError';
  }
}

export class ListingValidationError extends Error {
  readonly code = 'THEME_LISTING_VALIDATION_ERROR' as const;
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Theme listing failed validation: ${issues.length} issue(s)`);
    this.name = 'ListingValidationError';
  }
}

export class ContentHashMismatchError extends Error {
  readonly code = 'THEME_BUNDLE_HASH_MISMATCH' as const;
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Theme bundle hash mismatch: expected ${expected}, got ${actual}`);
    this.name = 'ContentHashMismatchError';
  }
}

export class RestrictedLicenseError extends Error {
  readonly code = 'THEME_ASSET_LICENSE_RESTRICTED' as const;
  constructor(public readonly assetIds: readonly string[]) {
    super(`Theme bundle contains restricted assets: ${assetIds.join(', ')}`);
    this.name = 'RestrictedLicenseError';
  }
}

export class A11yCertificationRequiredError extends Error {
  readonly code = 'THEME_A11Y_CERTIFICATION_REQUIRED' as const;
  constructor(public readonly listingId: string) {
    super(`Theme listing ${listingId} must be a11y certified before it can be featured`);
    this.name = 'A11yCertificationRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Service options + inputs
// ---------------------------------------------------------------------------

export interface MarketplaceServiceOptions {
  readonly repository: MarketplaceRepository;
  readonly idGenerator?: () => ULID;
  readonly clock?: () => Date;
}

export interface CreateListingInput {
  readonly sellerOrgId: string;
  readonly name: string;
  readonly description: string;
  readonly bundle: ThemeBundle;
  readonly createdBy: string;
}

export interface UpdateListingInput {
  readonly name?: string;
  readonly description?: string;
  readonly bundle?: ThemeBundle;
}

export interface InstallThemeInput {
  readonly listingId: string;
  readonly installerOrgId: string;
  readonly submittedContentHash: string;
  readonly installedBy: string;
  readonly isAdmin: boolean;
  readonly adminOverride?: boolean;
}

export interface AddReviewInput {
  readonly listingId: string;
  readonly orgId: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly body: string;
  readonly sampleThumbnailUrl?: string;
  readonly sampleOptIn: boolean;
  readonly createdBy: string;
}

const defaultClock = () => new Date();
const defaultId: () => ULID = () =>
  asULID(
    `01H0000000000000000000000${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`
      .slice(0, 26)
      .padEnd(26, '0'),
  );

// ---------------------------------------------------------------------------
// Canonical serialization + hashing
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return value;
}

export function hashThemeBundle(bundle: ThemeBundle): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(bundle)))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MarketplacePreviewService {
  private readonly repo: MarketplaceRepository;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;

  constructor(opts: MarketplaceServiceOptions) {
    this.repo = opts.repository;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  async createListing(input: CreateListingInput): Promise<ThemeListingRecord> {
    this.validateListing(input.name, input.description, input.bundle);
    const now = this.clock();
    const listing: ThemeListingRecord = {
      listingId: this.idGen(),
      sellerOrgId: input.sellerOrgId,
      name: input.name,
      description: input.description,
      status: 'draft',
      bundle: input.bundle,
      contentHash: hashThemeBundle(input.bundle),
      a11yCertified: false,
      featured: false,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insertListing(listing);
    return listing;
  }

  async getListing(listingId: string): Promise<ThemeListingRecord> {
    const listing = await this.repo.findListing(listingId);
    if (!listing) throw new ListingNotFoundError(listingId);
    return listing;
  }

  async listListings(status?: ListingStatus): Promise<ThemeListingRecord[]> {
    return this.repo.listListings(status);
  }

  async updateListing(listingId: string, patch: UpdateListingInput): Promise<ThemeListingRecord> {
    const existing = await this.getListing(listingId);
    const name = patch.name ?? existing.name;
    const description = patch.description ?? existing.description;
    const bundle = patch.bundle ?? existing.bundle;
    this.validateListing(name, description, bundle);
    return this.repo.updateListing(listingId, {
      name,
      description,
      bundle,
      contentHash: hashThemeBundle(bundle),
      // Changing the bundle invalidates any previous certification.
      ...(patch.bundle !== undefined ? { a11yCertified: false, featured: false } : {}),
      updatedAt: this.clock(),
    });
  }

  async publishListing(listingId: string): Promise<ThemeListingRecord> {
    const listing = await this.getListing(listingId);
    this.validateListing(listing.name, listing.description, listing.bundle);
    return this.repo.updateListing(listingId, {
      status: 'published',
      updatedAt: this.clock(),
    });
  }

  async archiveListing(listingId: string): Promise<ThemeListingRecord> {
    await this.getListing(listingId);
    return this.repo.updateListing(listingId, {
      status: 'archived',
      featured: false,
      updatedAt: this.clock(),
    });
  }

  async certifyA11y(listingId: string, passed: boolean): Promise<ThemeListingRecord> {
    await this.getListing(listingId);
    return this.repo.updateListing(listingId, {
      a11yCertified: passed,
      ...(passed ? {} : { featured: false }),
      updatedAt: this.clock(),
    });
  }

  async setFeatured(listingId: string, featured: boolean): Promise<ThemeListingRecord> {
    const listing = await this.getListing(listingId);
    if (featured && !listing.a11yCertified) {
      throw new A11yCertificationRequiredError(listingId);
    }
    return this.repo.updateListing(listingId, {
      featured,
      updatedAt: this.clock(),
    });
  }

  async installTheme(input: InstallThemeInput): Promise<ThemeInstallRecord> {
    const listing = await this.getListing(input.listingId);
    if (listing.status !== 'published') {
      throw new ListingValidationError([
        { path: 'status', message: 'Only published listings can be installed' },
      ]);
    }

    const actual = hashThemeBundle(listing.bundle);
    if (input.submittedContentHash !== listing.contentHash || actual !== listing.contentHash) {
      throw new ContentHashMismatchError(listing.contentHash, actual);
    }

    const restricted = listing.bundle.assets
      .filter((asset) => asset.licenseStatus === 'restricted')
      .map((asset) => asset.assetId);
    const adminOverride = Boolean(input.adminOverride && input.isAdmin);
    if (restricted.length > 0 && !adminOverride) {
      throw new RestrictedLicenseError(restricted);
    }

    const record: ThemeInstallRecord = {
      installId: this.idGen(),
      listingId: listing.listingId,
      installerOrgId: input.installerOrgId,
      // Install always creates a draft kit; it never mutates a deck.
      brandKitDraftId: this.idGen(),
      verifiedContentHash: actual,
      adminOverride,
      installedBy: input.installedBy,
      installedAt: this.clock(),
    };
    await this.repo.insertInstall(record);
    return record;
  }

  async listInstalls(orgId: string): Promise<ThemeInstallRecord[]> {
    return this.repo.listInstallsByOrg(orgId);
  }

  async addReview(input: AddReviewInput): Promise<ThemeReviewRecord> {
    await this.getListing(input.listingId);
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new ListingValidationError([
        { path: 'rating', message: 'Rating must be an integer from 1 to 5' },
      ]);
    }
    if (input.sampleThumbnailUrl && !input.sampleOptIn) {
      throw new ListingValidationError([
        {
          path: 'sampleOptIn',
          message: 'A buyer-applied sample requires explicit opt-in',
        },
      ]);
    }
    const review: ThemeReviewRecord = {
      reviewId: this.idGen(),
      listingId: input.listingId,
      orgId: input.orgId,
      rating: input.rating,
      body: input.body,
      ...(input.sampleThumbnailUrl ? { sampleThumbnailUrl: input.sampleThumbnailUrl } : {}),
      sampleOptIn: input.sampleOptIn,
      createdBy: input.createdBy,
      createdAt: this.clock(),
    };
    await this.repo.insertReview(review);
    return review;
  }

  async listReviews(listingId: string): Promise<ThemeReviewRecord[]> {
    await this.getListing(listingId);
    return this.repo.listReviews(listingId);
  }

  private validateListing(name: string, description: string, bundle: ThemeBundle): void {
    const issues: { path: string; message: string }[] = [];
    if (name.trim().length < 1 || name.length > 160) {
      issues.push({ path: 'name', message: 'Name must be 1..160 characters' });
    }
    if (description.length > 2_000) {
      issues.push({ path: 'description', message: 'Description must be at most 2000 characters' });
    }
    if (bundle.schemaVersion !== '1.0.0') {
      issues.push({ path: 'bundle.schemaVersion', message: 'Unsupported schema version' });
    }
    if (bundle.themes.length === 0) {
      issues.push({ path: 'bundle.themes', message: 'Bundle must include at least one theme' });
    }
    for (const asset of bundle.assets) {
      this.validateAssetLicense(asset.licenseStatus, asset.assetId, issues);
      if (!/^[0-9a-f]{64}$/i.test(asset.contentHash)) {
        issues.push({
          path: `bundle.assets.${asset.assetId}.contentHash`,
          message: 'Asset content hash must be SHA-256 hex',
        });
      }
    }
    if (issues.length > 0) throw new ListingValidationError(issues);
  }

  private validateAssetLicense(
    status: AssetLicenseStatus,
    assetId: string,
    issues: { path: string; message: string }[],
  ): void {
    if (!['permissive', 'restricted', 'unknown'].includes(status)) {
      issues.push({
        path: `bundle.assets.${assetId}.licenseStatus`,
        message: 'Invalid license status',
      });
    }
  }
}
