/**
 * Theme marketplace preview service — persistence layer (Phase 07 #45).
 *
 * Stores marketplace theme bundles, immutable install receipts, and
 * opt-in buyer sample reviews.  The in-memory repository mirrors the
 * Postgres-ready interface used by the production service.
 */

export type ListingStatus = 'draft' | 'published' | 'archived';
export type AssetLicenseStatus = 'permissive' | 'restricted' | 'unknown';

export interface ThemeBundleAsset {
  readonly assetId: string;
  readonly kind: 'font' | 'logo' | 'image';
  readonly name: string;
  readonly licenseStatus: AssetLicenseStatus;
  readonly licenseUrl?: string;
  readonly contentHash: string;
}

export interface ThemeBundle {
  readonly schemaVersion: '1.0.0';
  readonly brandKitDraft: Record<string, unknown>;
  readonly themes: readonly Record<string, unknown>[];
  readonly assets: readonly ThemeBundleAsset[];
}

export interface ThemeListingRecord {
  readonly listingId: string;
  readonly sellerOrgId: string;
  readonly name: string;
  readonly description: string;
  readonly status: ListingStatus;
  readonly bundle: ThemeBundle;
  readonly contentHash: string;
  readonly a11yCertified: boolean;
  readonly featured: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ThemeInstallRecord {
  readonly installId: string;
  readonly listingId: string;
  readonly installerOrgId: string;
  readonly brandKitDraftId: string;
  readonly verifiedContentHash: string;
  readonly adminOverride: boolean;
  readonly installedBy: string;
  readonly installedAt: Date;
}

export interface ThemeReviewRecord {
  readonly reviewId: string;
  readonly listingId: string;
  readonly orgId: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly body: string;
  readonly sampleThumbnailUrl?: string;
  readonly sampleOptIn: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface MarketplaceRepository {
  insertListing(record: ThemeListingRecord): Promise<void>;
  updateListing(listingId: string, patch: Partial<ThemeListingRecord>): Promise<ThemeListingRecord>;
  findListing(listingId: string): Promise<ThemeListingRecord | null>;
  listListings(status?: ListingStatus): Promise<ThemeListingRecord[]>;
  insertInstall(record: ThemeInstallRecord): Promise<void>;
  listInstallsByOrg(orgId: string): Promise<ThemeInstallRecord[]>;
  insertReview(record: ThemeReviewRecord): Promise<void>;
  listReviews(listingId: string): Promise<ThemeReviewRecord[]>;
}

export class InMemoryMarketplaceRepository implements MarketplaceRepository {
  private listings = new Map<string, ThemeListingRecord>();
  private installs: ThemeInstallRecord[] = [];
  private reviews: ThemeReviewRecord[] = [];

  async insertListing(record: ThemeListingRecord): Promise<void> {
    this.listings.set(record.listingId, record);
  }

  async updateListing(
    listingId: string,
    patch: Partial<ThemeListingRecord>,
  ): Promise<ThemeListingRecord> {
    const existing = this.listings.get(listingId);
    if (!existing) throw new Error(`Theme listing ${listingId} not found`);
    const updated: ThemeListingRecord = {
      ...existing,
      ...patch,
    };
    this.listings.set(listingId, updated);
    return updated;
  }

  async findListing(listingId: string): Promise<ThemeListingRecord | null> {
    return this.listings.get(listingId) ?? null;
  }

  async listListings(status?: ListingStatus): Promise<ThemeListingRecord[]> {
    const all = [...this.listings.values()];
    return status ? all.filter((r) => r.status === status) : all;
  }

  async insertInstall(record: ThemeInstallRecord): Promise<void> {
    this.installs.push(record);
  }

  async listInstallsByOrg(orgId: string): Promise<ThemeInstallRecord[]> {
    return this.installs.filter((r) => r.installerOrgId === orgId);
  }

  async insertReview(record: ThemeReviewRecord): Promise<void> {
    this.reviews.push(record);
  }

  async listReviews(listingId: string): Promise<ThemeReviewRecord[]> {
    return this.reviews.filter((r) => r.listingId === listingId);
  }
}
