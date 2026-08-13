/**
 * Webhook service tests — Wave 8 §S8.8.
 */

import { describe, it, expect } from 'vitest';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  listDeliveries,
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
