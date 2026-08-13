/**
 * Font service — Prometheus metrics.
 */

export interface FontMetricSnapshot {
  readonly fontUploadedTotal: number;
  readonly fontLicenseBlockedTotal: number;
}

export class FontMetrics {
  fontUploadedTotal = 0;
  fontLicenseBlockedTotal = 0;

  recordUpload(): void {
    this.fontUploadedTotal++;
  }
  recordLicenseBlock(): void {
    this.fontLicenseBlockedTotal++;
  }

  snapshot(): FontMetricSnapshot {
    return {
      fontUploadedTotal: this.fontUploadedTotal,
      fontLicenseBlockedTotal: this.fontLicenseBlockedTotal,
    };
  }
}
