/**
 * Export pipeline — metrics counters (Phase 09).
 *
 * In-memory counters for job lifecycle events, encoding errors,
 * and SSRF blocks.  Mirrors the theme service metrics pattern.
 */

export interface ExportMetricSnapshot {
  readonly jobsCreated: number;
  readonly jobsReady: number;
  readonly jobsFailed: number;
  readonly encodeErrors: number;
  readonly ssrfBlocks: number;
}

export class ExportMetrics {
  jobsCreated = 0;
  jobsReady = 0;
  jobsFailed = 0;
  encodeErrors = 0;
  ssrfBlocks = 0;

  recordJobCreated(): void {
    this.jobsCreated++;
  }

  recordJobReady(): void {
    this.jobsReady++;
  }

  recordJobFailed(): void {
    this.jobsFailed++;
  }

  recordEncodeError(): void {
    this.encodeErrors++;
  }

  recordSsrfBlock(): void {
    this.ssrfBlocks++;
  }

  snapshot(): ExportMetricSnapshot {
    return {
      jobsCreated: this.jobsCreated,
      jobsReady: this.jobsReady,
      jobsFailed: this.jobsFailed,
      encodeErrors: this.encodeErrors,
      ssrfBlocks: this.ssrfBlocks,
    };
  }
}
