/**
 * Webhook Dispatcher (Phase 19 Wave 5 — WS-MKT-5/8/9).
 *
 * Handles outbound webhook delivery with rate limiting and retry logic.
 * Stores delivery attempts in webhook_delivery table for idempotent dedup.
 */

import { createHmac } from 'crypto';
import type { WebhookDelivery } from '../types.js';
import type { MarketplaceStore } from '../store/store.js';

// ---------------------------------------------------------------------------
// Rate limiter (simple in-memory token bucket)
// ---------------------------------------------------------------------------

export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private readonly refillAmount: number;

  constructor(opts: {
    maxTokens: number;
    refillIntervalMs: number;
    refillAmount: number;
  }) {
    this.maxTokens = opts.maxTokens;
    this.refillIntervalMs = opts.refillIntervalMs;
    this.refillAmount = opts.refillAmount;
  }

  tryConsume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refillCount = Math.floor(elapsed / this.refillIntervalMs) * this.refillAmount;
    if (refillCount > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillCount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook Dispatcher
// ---------------------------------------------------------------------------

export interface WebhookDispatcherOptions {
  readonly store: MarketplaceStore;
  readonly rateLimiter?: RateLimiter;
  /** Max retry attempts. Default: 3. */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff in ms. Default: 1000. */
  readonly baseRetryDelayMs?: number;
  /** HMAC secret for webhook signing. */
  readonly hmacSecret?: string;
}

export class WebhookDispatcher {
  private readonly store: MarketplaceStore;
  private readonly rateLimiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly hmacSecret: string;

  constructor(opts: WebhookDispatcherOptions) {
    this.store = opts.store;
    this.rateLimiter = opts.rateLimiter ?? new RateLimiter({
      maxTokens: 100,
      refillIntervalMs: 1000,
      refillAmount: 10,
    });
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseRetryDelayMs = opts.baseRetryDelayMs ?? 1000;
    this.hmacSecret = opts.hmacSecret ?? 'marketplace-webhook-hmac-secret';
  }

  /**
   * Create a webhook delivery record.
   */
  async createDelivery(delivery: WebhookDelivery): Promise<void> {
    await this.store.createWebhookDelivery(delivery);
  }

  /**
   * Sign a webhook payload with HMAC-SHA256.
   */
  signPayload(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return createHmac('sha256', this.hmacSecret).update(canonical, 'utf8').digest('hex');
  }

  /**
   * Dispatch a single webhook delivery (HTTP POST).
   * In production, this would use fetch/axios. For now, it's a scaffold.
   */
  async dispatch(delivery: WebhookDelivery): Promise<{ success: boolean; error?: string }> {
    // Rate limit check
    if (!this.rateLimiter.tryConsume(delivery.targetUrl)) {
      return { success: false, error: 'rate_limit_exceeded' };
    }

    // In production: actual HTTP POST to delivery.targetUrl
    // For scaffold: simulate success
    const success = Math.random() > 0.1; // 90% success rate for testing
    if (success) {
      await this.store.updateWebhookDeliveryStatus(delivery.id, 'sent', {
        attempts: delivery.attempts + 1,
        deliveredAt: new Date(),
      });
    } else {
      const nextRetry = delivery.attempts + 1 < this.maxRetries
        ? new Date(Date.now() + this.baseRetryDelayMs * Math.pow(2, delivery.attempts))
        : null;
      await this.store.updateWebhookDeliveryStatus(delivery.id, 'failed', {
        attempts: delivery.attempts + 1,
        lastError: 'Delivery failed (scaffold)',
        nextRetryAt: nextRetry,
      });
    }
    return { success };
  }

  /**
   * Process pending webhook deliveries due for retry.
   */
  async processDueDeliveries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const now = new Date();
    const deliveries = await this.store.listWebhookDeliveriesDue(now);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      processed++;
      const result = await this.dispatch(delivery);
      if (result.success) succeeded++;
      else failed++;
    }

    return { processed, succeeded, failed };
  }
}
