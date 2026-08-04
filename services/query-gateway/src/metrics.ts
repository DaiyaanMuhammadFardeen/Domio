/**
 * Query gateway — metrics (Phase 08 M2).
 *
 * Counters + histograms for query execution, rate limiting, caching,
 * and viewer token issuance.
 */

export interface QueryGatewayMetricSnapshot {
  readonly queriesExecutedTotal: number;
  readonly queriesBlockedByRateLimit: number;
  readonly cacheHitsTotal: number;
  readonly cacheMissesTotal: number;
  readonly viewerTokensIssuedTotal: number;
  readonly webhooksProcessedTotal: number;
  readonly webhooksDedupedTotal: number;
  readonly invalidationsTotal: number;
  readonly executionLatencyMs: number[];
}

export class QueryGatewayMetrics {
  queriesExecutedTotal = 0;
  queriesBlockedByRateLimit = 0;
  cacheHitsTotal = 0;
  cacheMissesTotal = 0;
  viewerTokensIssuedTotal = 0;
  webhooksProcessedTotal = 0;
  webhooksDedupedTotal = 0;
  invalidationsTotal = 0;
  executionLatencyMs: number[] = [];

  recordExecution(latencyMs: number): void {
    this.queriesExecutedTotal++;
    this.executionLatencyMs.push(latencyMs);
  }

  recordRateLimitBlock(): void {
    this.queriesBlockedByRateLimit++;
  }

  recordCacheHit(): void {
    this.cacheHitsTotal++;
  }

  recordCacheMiss(): void {
    this.cacheMissesTotal++;
  }

  recordViewerTokenIssued(): void {
    this.viewerTokensIssuedTotal++;
  }

  recordWebhookProcessed(): void {
    this.webhooksProcessedTotal++;
  }

  recordWebhookDeduped(): void {
    this.webhooksDedupedTotal++;
  }

  recordInvalidation(): void {
    this.invalidationsTotal++;
  }

  snapshot(): QueryGatewayMetricSnapshot {
    return {
      queriesExecutedTotal: this.queriesExecutedTotal,
      queriesBlockedByRateLimit: this.queriesBlockedByRateLimit,
      cacheHitsTotal: this.cacheHitsTotal,
      cacheMissesTotal: this.cacheMissesTotal,
      viewerTokensIssuedTotal: this.viewerTokensIssuedTotal,
      webhooksProcessedTotal: this.webhooksProcessedTotal,
      webhooksDedupedTotal: this.webhooksDedupedTotal,
      invalidationsTotal: this.invalidationsTotal,
      executionLatencyMs: [...this.executionLatencyMs],
    };
  }

  /** p95 of execution latencies (returns 0 if no samples). */
  p95ExecutionLatencyMs(): number {
    if (this.executionLatencyMs.length === 0) return 0;
    const sorted = [...this.executionLatencyMs].sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    return sorted[idx] ?? 0;
  }
}
