/**
 * Marketplace preview — Prometheus metrics (Phase 07 #45).
 */

export interface MarketplaceMetricSnapshot {
  readonly listingCreatedTotal: number;
  readonly listingPublishedTotal: number;
  readonly listingArchivedTotal: number;
  readonly installTotal: number;
  readonly installRejectedTotal: number;
  readonly reviewTotal: number;
}

export class MarketplaceMetrics {
  listingCreatedTotal = 0;
  listingPublishedTotal = 0;
  listingArchivedTotal = 0;
  installTotal = 0;
  installRejectedTotal = 0;
  reviewTotal = 0;

  recordListingCreate(): void {
    this.listingCreatedTotal++;
  }
  recordListingPublish(): void {
    this.listingPublishedTotal++;
  }
  recordListingArchive(): void {
    this.listingArchivedTotal++;
  }
  recordInstall(): void {
    this.installTotal++;
  }
  recordInstallRejected(): void {
    this.installRejectedTotal++;
  }
  recordReview(): void {
    this.reviewTotal++;
  }

  snapshot(): MarketplaceMetricSnapshot {
    return {
      listingCreatedTotal: this.listingCreatedTotal,
      listingPublishedTotal: this.listingPublishedTotal,
      listingArchivedTotal: this.listingArchivedTotal,
      installTotal: this.installTotal,
      installRejectedTotal: this.installRejectedTotal,
      reviewTotal: this.reviewTotal,
    };
  }
}