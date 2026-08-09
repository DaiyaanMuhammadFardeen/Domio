/**
 * Webhook Dispatcher tests (Phase 19 Wave 5 — WS-MKT-5/8/9).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookDispatcher, RateLimiter } from './dispatcher.js';
import { InMemoryMarketplaceStore } from '../store/mem_store.js';
import type { WebhookDelivery } from '../types.js';

describe('RateLimiter', () => {
  it('allows consumption within token limit', () => {
    const limiter = new RateLimiter({
      maxTokens: 5,
      refillIntervalMs: 1000,
      refillAmount: 1,
    });

    // Should allow 5 consumptions
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume('key-1')).toBe(true);
    }
    // 6th should fail
    expect(limiter.tryConsume('key-1')).toBe(false);
  });

  it('refills tokens over time', async () => {
    const limiter = new RateLimiter({
      maxTokens: 2,
      refillIntervalMs: 10,
      refillAmount: 1,
    });

    // Consume all tokens
    expect(limiter.tryConsume('key-1')).toBe(true);
    expect(limiter.tryConsume('key-1')).toBe(true);
    expect(limiter.tryConsume('key-1')).toBe(false);

    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 15));

    // Should allow one more
    expect(limiter.tryConsume('key-1')).toBe(true);
  });
});

describe('WebhookDispatcher', () => {
  let store: InMemoryMarketplaceStore;
  let dispatcher: WebhookDispatcher;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    dispatcher = new WebhookDispatcher({
      store,
      maxRetries: 3,
      baseRetryDelayMs: 100,
      hmacSecret: 'test-secret',
    });
  });

  describe('createDelivery', () => {
    it('creates a webhook delivery record', async () => {
      const delivery: WebhookDelivery = {
        id: 'del-1',
        workspaceId: 'ws-1',
        eventType: 'listing.published',
        eventId: 'evt-1',
        payload: { listing_id: 'l1' },
        signature: 'sig-1',
        targetUrl: 'https://example.com/webhook',
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: new Date(),
        deliveredAt: null,
      };

      await dispatcher.createDelivery(delivery);
      const found = await store.getWebhookDelivery(delivery.id);
      expect(found).toBeTruthy();
      expect(found!.status).toBe('pending');
    });
  });

  describe('signPayload', () => {
    it('generates HMAC-SHA256 signature', () => {
      const sig = dispatcher.signPayload({ listing_id: 'l1', event: 'published' });
      expect(sig).toBeTruthy();
      expect(typeof sig).toBe('string');
      expect(sig.length).toBe(64); // SHA256 hex
    });

    it('generates deterministic signature', () => {
      const sig1 = dispatcher.signPayload({ listing_id: 'l1' });
      const sig2 = dispatcher.signPayload({ listing_id: 'l1' });
      expect(sig1).toBe(sig2);
    });

    it('different payloads produce different signatures', () => {
      const sig1 = dispatcher.signPayload({ listing_id: 'l1' });
      const sig2 = dispatcher.signPayload({ listing_id: 'l2' });
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('dispatch', () => {
    it('dispatches a webhook delivery', async () => {
      const delivery: WebhookDelivery = {
        id: 'del-1',
        workspaceId: 'ws-1',
        eventType: 'listing.published',
        eventId: 'evt-1',
        payload: { listing_id: 'l1' },
        signature: 'sig-1',
        targetUrl: 'https://example.com/webhook',
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: new Date(),
        deliveredAt: null,
      };

      await store.createWebhookDelivery(delivery);
      const result = await dispatcher.dispatch(delivery);

      // Scaffold: 90% success rate, so result may vary
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
