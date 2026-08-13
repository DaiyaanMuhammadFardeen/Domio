/**
 * Webhook service — Wave 8 §S8.8.
 *
 * In-memory deterministic seed for the admin-console webhook console.
 * Mirrors the api-key-service pattern: resilient fetch with seed
 * fallback. Deliveries are seeded per webhook so the "Recent
 * deliveries" expandable panel has data on first render.
 */

import { fetcher } from './fetcher';
import type { Webhook, WebhookDelivery, WebhookEventType, WebhookInput } from './types';

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

const SEED: readonly Webhook[] = [
  {
    id: 'wh-acme-deploy',
    tenant_id: 'acme',
    url: 'https://hooks.acme.com/domio/deploy',
    events: ['deck.published', 'deck.shared'],
    secret_rotated_at_ms: NOW - 60 * DAY_MS,
    retry_policy: { max_retries: 5, backoff_seconds: 30 },
    enabled: true,
    last_delivery_at_ms: NOW - 1000 * 60 * 9,
    last_delivery_status: 200,
    created_at_ms: NOW - 120 * DAY_MS,
  },
  {
    id: 'wh-acme-audit',
    tenant_id: 'acme',
    url: 'https://audit.acme.com/ingest/domio',
    events: ['audit.event', 'user.invited', 'user.removed'],
    secret_rotated_at_ms: NOW - 30 * DAY_MS,
    retry_policy: { max_retries: 8, backoff_seconds: 60 },
    enabled: true,
    last_delivery_at_ms: NOW - 1000 * 60 * 90,
    last_delivery_status: 500,
    created_at_ms: NOW - 200 * DAY_MS,
  },
  {
    id: 'wh-initech-sso',
    tenant_id: 'initech',
    url: 'https://siem.initech.io/domio/sso-events',
    events: ['sso.test-login'],
    secret_rotated_at_ms: null,
    retry_policy: { max_retries: 3, backoff_seconds: 15 },
    enabled: false,
    last_delivery_at_ms: NOW - 1000 * 60 * 60 * 24 * 5,
    last_delivery_status: 404,
    created_at_ms: NOW - 45 * DAY_MS,
  },
];

// Mutable working copies.
const STORE: Webhook[] = SEED.map((w) => ({ ...w, events: w.events.slice() }));
const DELIVERIES: WebhookDelivery[] = [];

function genId(): string {
  return `wh-${Math.random().toString(36).slice(2, 10)}`;
}

function clone(w: Webhook): Webhook {
  return { ...w, events: w.events.slice() };
}

const DELIVERY_TEMPLATES: ReadonlyArray<{
  readonly event: WebhookEventType;
  readonly status_code: number;
  readonly excerpt: string;
}> = [
  { event: 'deck.published', status_code: 200, excerpt: '{"ok":true}' },
  { event: 'deck.shared', status_code: 200, excerpt: '{"ok":true}' },
  { event: 'deck.unshared', status_code: 200, excerpt: '{"ok":true}' },
  { event: 'audit.event', status_code: 500, excerpt: '{"error":"downstream timeout"}' },
  { event: 'user.invited', status_code: 200, excerpt: '{"ok":true}' },
  { event: 'user.removed', status_code: 204, excerpt: '' },
  { event: 'sso.test-login', status_code: 404, excerpt: '{"error":"no route"}' },
  { event: 'plugin.installed', status_code: 200, excerpt: '{"ok":true}' },
];

// Seed 8 deliveries per webhook so the panel renders on first load.
for (const wh of STORE) {
  for (let i = 0; i < 8; i += 1) {
    const tpl =
      DELIVERY_TEMPLATES[(i + Math.floor(Math.random() * 8)) % DELIVERY_TEMPLATES.length] ??
      DELIVERY_TEMPLATES[0];
    if (!tpl) continue;
    DELIVERIES.push({
      id: `wd-${wh.id}-${i.toString().padStart(2, '0')}`,
      webhook_id: wh.id,
      event: tpl.event,
      attempt: (i % 3) + 1,
      status_code: tpl.status_code,
      delivered_at_ms: NOW - i * 1000 * 60 * 47,
      response_body_excerpt: tpl.excerpt,
    });
  }
}

export async function listWebhooks(
  opts: { readonly tenantId?: string } = {},
): Promise<ReadonlyArray<Webhook>> {
  try {
    const params = opts.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : '';
    const json = await fetcher<{ items?: Webhook[] }>(`/v1/admin/webhooks${params}`);
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through
  }
  const items = opts.tenantId ? STORE.filter((w) => w.tenant_id === opts.tenantId) : STORE.slice();
  return items.map(clone);
}

export async function getWebhook(id: string): Promise<Webhook | undefined> {
  try {
    return await fetcher<Webhook>(`/v1/admin/webhooks/${encodeURIComponent(id)}`);
  } catch {
    const found = STORE.find((w) => w.id === id);
    return found ? clone(found) : undefined;
  }
}

export async function createWebhook(input: WebhookInput): Promise<Webhook> {
  if (!input.url.trim().toLowerCase().startsWith('https://')) {
    throw new Error('Webhook URL must use HTTPS');
  }
  if (input.events.length === 0) {
    throw new Error('At least one event must be selected');
  }
  const w: Webhook = {
    id: genId(),
    tenant_id: 'acme',
    url: input.url.trim(),
    events: input.events.slice(),
    secret_rotated_at_ms: NOW,
    retry_policy: {
      max_retries: input.retry_policy.max_retries,
      backoff_seconds: input.retry_policy.backoff_seconds,
    },
    enabled: true,
    last_delivery_at_ms: null,
    last_delivery_status: null,
    created_at_ms: NOW,
  };
  STORE.push(w);
  try {
    return await fetcher<Webhook>('/v1/admin/webhooks', {
      method: 'POST',
      body: input,
    });
  } catch {
    return clone(w);
  }
}

export async function updateWebhook(id: string, input: WebhookInput): Promise<Webhook> {
  const idx = STORE.findIndex((w) => w.id === id);
  if (idx < 0) {
    throw new Error(`Webhook ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`Webhook ${id} not found`);
  }
  const next: Webhook = {
    ...prev,
    url: input.url.trim(),
    events: input.events.slice(),
    retry_policy: {
      max_retries: input.retry_policy.max_retries,
      backoff_seconds: input.retry_policy.backoff_seconds,
    },
  };
  STORE[idx] = next;
  try {
    return await fetcher<Webhook>(`/v1/admin/webhooks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    });
  } catch {
    return clone(next);
  }
}

export async function deleteWebhook(id: string): Promise<void> {
  const idx = STORE.findIndex((w) => w.id === id);
  if (idx < 0) {
    throw new Error(`Webhook ${id} not found`);
  }
  STORE.splice(idx, 1);
  // Also clear any seeded deliveries for the deleted webhook.
  for (let i = DELIVERIES.length - 1; i >= 0; i -= 1) {
    if (DELIVERIES[i]?.webhook_id === id) {
      DELIVERIES.splice(i, 1);
    }
  }
  try {
    await fetcher<void>(`/v1/admin/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // swallow
  }
}

export async function rotateSecret(id: string): Promise<Webhook> {
  const idx = STORE.findIndex((w) => w.id === id);
  if (idx < 0) {
    throw new Error(`Webhook ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`Webhook ${id} not found`);
  }
  const next: Webhook = { ...prev, secret_rotated_at_ms: NOW };
  STORE[idx] = next;
  try {
    return await fetcher<Webhook>(`/v1/admin/webhooks/${encodeURIComponent(id)}/rotate-secret`, {
      method: 'POST',
    });
  } catch {
    return clone(next);
  }
}

export async function listDeliveries(webhookId: string): Promise<ReadonlyArray<WebhookDelivery>> {
  // Mirrors a paginated GET /v1/admin/webhooks/:id/deliveries endpoint
  // when it lands. For the seed we hand back up to 8 rows so the
  // panel has a deterministic upper bound.
  try {
    const json = await fetcher<{ items?: WebhookDelivery[] }>(
      `/v1/admin/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through
  }
  return DELIVERIES.filter((d) => d.webhook_id === webhookId).slice(0, 8);
}

export const WEBHOOK_EVENT_TYPES: ReadonlyArray<WebhookEventType> = [
  'deck.published',
  'deck.shared',
  'deck.unshared',
  'user.invited',
  'user.removed',
  'audit.event',
  'sso.test-login',
  'plugin.installed',
  'plugin.disabled',
];

// ── Wave 10 §S10.2: per-event subscriptions + tester ────────────────────
//
// Compact subscription model keyed by a single event. Distinct from the
// legacy `Webhook` record above (which keys by URL with many events).
// Real endpoints will live under `/v1/admin/webhooks/subscriptions/*`.
// Until then we keep a small in-memory store and a deterministic
// `testWebhook` that simulates a delivery.

export type WebhookRetryPolicy = 'none' | 'exp1' | 'exp3';

const VALID_RETRY_POLICIES: ReadonlyArray<WebhookRetryPolicy> = ['none', 'exp1', 'exp3'];

export interface WebhookSubscription {
  readonly id: string;
  readonly event: string;
  readonly url: string;
  readonly secret_last4: string;
  readonly retry_policy: WebhookRetryPolicy;
  readonly active: boolean;
  readonly created_at_ms: number;
}

export interface WebhookTestResult {
  readonly status_code: number;
  readonly latency_ms: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly sent_at_ms: number;
}

export interface WebhookSubscriptionInput {
  readonly event: string;
  readonly url: string;
  readonly secret: string;
  readonly retry_policy: WebhookRetryPolicy;
}

const SUBSCRIPTION_SEED: ReadonlyArray<WebhookSubscription> = [
  {
    id: 'sub-deck-viewed',
    event: 'deck.viewed',
    url: 'https://hooks.example.com/domio/deck-viewed',
    secret_last4: 'f01a',
    retry_policy: 'exp3',
    active: true,
    created_at_ms: NOW - 14 * DAY_MS,
  },
  {
    id: 'sub-comment-added',
    event: 'comment.added',
    url: 'https://hooks.example.com/domio/comments',
    secret_last4: 'c9b2',
    retry_policy: 'exp1',
    active: true,
    created_at_ms: NOW - 9 * DAY_MS,
  },
  {
    id: 'sub-approval-granted',
    event: 'approval.granted',
    url: 'https://hooks.example.com/domio/approvals',
    secret_last4: '84ee',
    retry_policy: 'exp3',
    active: true,
    created_at_ms: NOW - 2 * DAY_MS,
  },
  {
    id: 'sub-data-updated',
    event: 'data.updated',
    url: 'https://hooks.example.com/domio/data',
    secret_last4: '1234',
    retry_policy: 'none',
    active: false,
    created_at_ms: NOW - 30 * DAY_MS,
  },
];

const SUBSCRIPTION_STORE: WebhookSubscription[] = SUBSCRIPTION_SEED.map((s) => ({ ...s }));

function subscriptionGenId(): string {
  return `sub-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSub(s: WebhookSubscription): WebhookSubscription {
  return { ...s };
}

export async function listSubscriptions(): Promise<ReadonlyArray<WebhookSubscription>> {
  try {
    const json = await fetcher<{ items?: WebhookSubscription[] }>(
      '/v1/admin/webhooks/subscriptions',
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through
  }
  return SUBSCRIPTION_STORE.map(cloneSub);
}

export async function createSubscription(
  input: WebhookSubscriptionInput,
): Promise<WebhookSubscription> {
  if (!input.url.trim().toLowerCase().startsWith('https://')) {
    throw new Error('Subscription URL must use HTTPS');
  }
  if (!input.event.trim()) {
    throw new Error('Event is required');
  }
  if (!VALID_RETRY_POLICIES.includes(input.retry_policy)) {
    throw new Error(`Invalid retry policy: ${input.retry_policy}`);
  }
  if (input.secret.length < 8) {
    throw new Error('Secret must be at least 8 characters');
  }
  const sub: WebhookSubscription = {
    id: subscriptionGenId(),
    event: input.event.trim(),
    url: input.url.trim(),
    secret_last4: input.secret.slice(-4),
    retry_policy: input.retry_policy,
    active: true,
    created_at_ms: NOW,
  };
  SUBSCRIPTION_STORE.push(sub);
  try {
    return await fetcher<WebhookSubscription>('/v1/admin/webhooks/subscriptions', {
      method: 'POST',
      body: input,
    });
  } catch {
    return cloneSub(sub);
  }
}

export async function testWebhook(
  subscriptionId: string,
  payload: Record<string, unknown>,
): Promise<WebhookTestResult> {
  const sub = SUBSCRIPTION_STORE.find((s) => s.id === subscriptionId);
  if (!sub) {
    throw new Error(`Subscription ${subscriptionId} not found`);
  }
  const start = Date.now();
  const sent_at_ms = start;
  try {
    await fetcher<WebhookTestResult>(
      `/v1/admin/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}/test`,
      { method: 'POST', body: payload },
    );
  } catch {
    // fall through to seed response
  }
  const hash = simpleHash(JSON.stringify(payload) + subscriptionId);
  const latency_ms = 20 + (hash % 60);
  const status_code = hash % 100 < 90 ? 200 : 500;
  return {
    status_code,
    latency_ms,
    headers: {
      'content-type': 'application/json',
      'x-domio-subscription': subscriptionId,
      'x-domio-event': sub.event,
      'x-domio-retry-policy': sub.retry_policy,
    },
    body: JSON.stringify(
      {
        ok: status_code < 400,
        received: payload,
        subscription_id: subscriptionId,
        event: sub.event,
      },
      null,
      2,
    ),
    sent_at_ms,
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
