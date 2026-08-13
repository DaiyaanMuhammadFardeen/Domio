/**
 * Webhook service tests — Wave 8 §S8.8 + Wave 10 §S10.2.
 */

import { describe, it, expect } from 'vitest';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  listDeliveries,
  listSubscriptions,
  createSubscription,
  testWebhook,
  type WebhookRetryPolicy,
} from './webhook-service';

describe('webhook-service', () => {
  it('lists 3+ seeded webhooks', async () => {
    const items = await listWebhooks();
    expect(items.length).toBeGreaterThanOrEqual(3);
    const ids = items.map((w) => w.id);
    expect(ids).toContain('wh-acme-deploy');
    expect(ids).toContain('wh-acme-audit');
    expect(ids).toContain('wh-initech-sso');
  });

  it('createWebhook returns a webhook with a generated id', async () => {
    const w = await createWebhook({
      url: 'https://example.com/hook',
      events: ['deck.published'],
      retry_policy: { max_retries: 3, backoff_seconds: 30 },
    });
    expect(w.id).toMatch(/^wh-/);
    expect(w.events).toContain('deck.published');
    expect(w.enabled).toBe(true);
  });

  it('rotateSecret updates secret_rotated_at_ms', async () => {
    const before = await listWebhooks();
    const target = before.find((w) => w.id === 'wh-initech-sso');
    expect(target?.secret_rotated_at_ms).toBeNull();
    const rotated = await rotateSecret('wh-initech-sso');
    expect(rotated.secret_rotated_at_ms).not.toBeNull();
    expect((rotated.secret_rotated_at_ms ?? 0) > 0).toBe(true);
  });

  it('deleteWebhook removes it from the list', async () => {
    const before = await listWebhooks();
    expect(before.some((w) => w.id === 'wh-acme-audit')).toBe(true);
    await deleteWebhook('wh-acme-audit');
    const after = await listWebhooks();
    expect(after.some((w) => w.id === 'wh-acme-audit')).toBe(false);
  });

  it('listDeliveries returns 0-8 items', async () => {
    const seeded = await listDeliveries('wh-acme-deploy');
    expect(seeded.length).toBeGreaterThanOrEqual(1);
    expect(seeded.length).toBeLessThanOrEqual(8);
    expect(seeded[0]?.webhook_id).toBe('wh-acme-deploy');
    const after = await listDeliveries('wh-does-not-exist');
    expect(after.length).toBe(0);
  });

  it('updateWebhook rewrites events and url', async () => {
    const updated = await updateWebhook('wh-acme-deploy', {
      url: 'https://hooks.acme.com/v2/domio',
      events: ['deck.published', 'deck.shared', 'deck.unshared'],
      retry_policy: { max_retries: 7, backoff_seconds: 45 },
    });
    expect(updated.url).toBe('https://hooks.acme.com/v2/domio');
    expect(updated.events).toContain('deck.unshared');
    expect(updated.retry_policy.max_retries).toBe(7);
  });

  it('createWebhook rejects non-HTTPS urls', async () => {
    await expect(
      createWebhook({
        url: 'http://insecure.example.com/hook',
        events: ['deck.published'],
        retry_policy: { max_retries: 1, backoff_seconds: 10 },
      }),
    ).rejects.toThrow(/HTTPS/i);
  });

  it('createWebhook rejects empty event list', async () => {
    await expect(
      createWebhook({
        url: 'https://example.com/hook',
        events: [],
        retry_policy: { max_retries: 1, backoff_seconds: 10 },
      }),
    ).rejects.toThrow(/event/i);
  });
});

describe('webhook-service subscriptions (Wave 10 §S10.2)', () => {
  it('listSubscriptions returns 4+ seeded subscriptions', async () => {
    const subs = await listSubscriptions();
    expect(subs.length).toBeGreaterThanOrEqual(4);
    const ids = subs.map((s) => s.id);
    expect(ids).toContain('sub-deck-viewed');
    expect(ids).toContain('sub-comment-added');
    expect(ids).toContain('sub-approval-granted');
    expect(ids).toContain('sub-data-updated');
  });

  it('createSubscription returns a subscription with a generated id and last4', async () => {
    const sub = await createSubscription({
      event: 'deck.viewed',
      url: 'https://example.com/hook',
      secret: 'whsec_0123456789abcdef',
      retry_policy: 'exp3',
    });
    expect(sub.id).toMatch(/^sub-/);
    expect(sub.event).toBe('deck.viewed');
    expect(sub.url).toBe('https://example.com/hook');
    expect(sub.secret_last4).toBe('cdef');
    expect(sub.active).toBe(true);
    expect(sub.retry_policy).toBe('exp3');
  });

  it('createSubscription appends to the list', async () => {
    const before = await listSubscriptions();
    const sub = await createSubscription({
      event: 'share.created',
      url: 'https://example.com/hook2',
      secret: 'whsec_abcdef0123456789',
      retry_policy: 'exp1',
    });
    const after = await listSubscriptions();
    expect(after.length).toBe(before.length + 1);
    expect(after.some((s) => s.id === sub.id)).toBe(true);
  });

  it.each<WebhookRetryPolicy>(['none', 'exp1', 'exp3'])(
    'createSubscription accepts retry policy %s',
    async (policy) => {
      const sub = await createSubscription({
        event: 'data.updated',
        url: 'https://example.com/hook',
        secret: 'whsec_0123456789abcdef',
        retry_policy: policy,
      });
      expect(sub.retry_policy).toBe(policy);
    },
  );

  it('createSubscription rejects a non-https url at runtime', async () => {
    await expect(
      createSubscription({
        event: 'deck.viewed',
        url: 'http://insecure.example.com/hook',
        secret: 'whsec_0123456789abcdef',
        retry_policy: 'exp3',
      }),
    ).rejects.toThrow(/HTTPS/i);
  });

  it('createSubscription rejects an empty event', async () => {
    await expect(
      createSubscription({
        event: '',
        url: 'https://example.com/hook',
        secret: 'whsec_0123456789abcdef',
        retry_policy: 'exp3',
      }),
    ).rejects.toThrow(/event/i);
  });

  it('createSubscription rejects a short secret', async () => {
    await expect(
      createSubscription({
        event: 'deck.viewed',
        url: 'https://example.com/hook',
        secret: 'short',
        retry_policy: 'exp3',
      }),
    ).rejects.toThrow(/secret/i);
  });

  it('testWebhook returns a populated result for a known subscription', async () => {
    const result = await testWebhook('sub-deck-viewed', {
      event: 'deck.viewed',
      deck_id: 'deck_1',
    });
    expect(result.status_code).toBeGreaterThanOrEqual(200);
    expect(result.status_code).toBeLessThan(600);
    expect(result.latency_ms).toBeGreaterThan(0);
    expect(result.headers['x-domio-subscription']).toBe('sub-deck-viewed');
    expect(result.headers['x-domio-event']).toBe('deck.viewed');
    expect(result.body).toContain('sub-deck-viewed');
    expect(result.sent_at_ms).toBeGreaterThan(0);
  });

  it('testWebhook is deterministic for the same payload + subscription', async () => {
    const a = await testWebhook('sub-deck-viewed', { event: 'deck.viewed', n: 1 });
    const b = await testWebhook('sub-deck-viewed', { event: 'deck.viewed', n: 1 });
    expect(a.status_code).toBe(b.status_code);
    expect(a.body).toBe(b.body);
  });

  it('testWebhook rejects an unknown subscription id', async () => {
    await expect(testWebhook('sub-does-not-exist', { hello: 'world' })).rejects.toThrow(
      /not found/i,
    );
  });
});
