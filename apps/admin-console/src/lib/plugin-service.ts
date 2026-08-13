/**
 * Plugin administration service stub — Wave 8 §S8.9.
 *
 * The real implementation calls `GET /v1/admin/plugins` and friends
 * (see contracts/openapi/v1/admin-service.yaml — TBD when the endpoint
 * lands in the admin service). Until then we expose deterministic local
 * data so the admin-console UI and tests have something to render.
 *
 * Mirrors the custom-domain-service / sso-service pattern: each in-memory
 * mutation returns a freshly-shaped object so callers can re-render.
 */

import type { Plugin, PluginPublishRequest, PluginScope, PluginState } from './types';

const NOW = Date.UTC(2026, 6, 1);

/**
 * Mutable seed. Tests may copy & re-seed for isolation; production
 * never mutates this directly — it goes through enable/disable/approve.
 */
const PLUGINS: Plugin[] = [
  {
    id: 'plg-slack-notifier',
    name: 'Slack Notifier',
    publisher: 'Domio Labs',
    version: '2.4.1',
    state: 'installed',
    scopes: ['read-decks', 'send-webhooks'],
    description:
      'Posts a Slack message whenever a deck is shared or updated. Supports channel routing rules per workspace.',
    installed_at_ms: NOW - 1000 * 60 * 60 * 24 * 90,
    installed_by: 'admin@acme.com',
    last_used_at_ms: NOW - 1000 * 60 * 25,
    deprecation_notice: null,
  },
  {
    id: 'plg-salesforce-sync',
    name: 'Salesforce Sync',
    publisher: 'Pipeline Co.',
    version: '1.7.0',
    state: 'installed',
    scopes: ['read-decks', 'read-users', 'send-webhooks'],
    description:
      'Two-way sync of deck engagement (views, shares) into Salesforce as Contact Activity. Requires read-users.',
    installed_at_ms: NOW - 1000 * 60 * 60 * 24 * 45,
    installed_by: 'ops@initech.com',
    last_used_at_ms: NOW - 1000 * 60 * 60 * 4,
    deprecation_notice: null,
  },
  {
    id: 'plg-zapier-bridge',
    name: 'Zapier Bridge',
    publisher: 'Zapier Inc.',
    version: '3.2.0',
    state: 'installed',
    scopes: ['read-decks', 'write-decks', 'send-webhooks'],
    description:
      'Trigger Zaps from deck events (view, share, comment). Read+write-decks scopes let the bridge create decks from templates.',
    installed_at_ms: NOW - 1000 * 60 * 60 * 24 * 14,
    installed_by: 'admin@stark.dev',
    last_used_at_ms: NOW - 1000 * 60 * 60 * 2,
    deprecation_notice: null,
  },
  {
    id: 'plg-ai-summary',
    name: 'AI Summary',
    publisher: 'OpenBridge',
    version: '0.9.0-beta',
    state: 'available',
    scopes: ['read-decks'],
    description:
      'Generates an executive summary for any deck using a hosted LLM. Summaries are cached for 24h per viewer.',
    installed_at_ms: null,
    installed_by: null,
    last_used_at_ms: null,
    deprecation_notice: null,
  },
  {
    id: 'plg-billing-export',
    name: 'Billing Export',
    publisher: 'Domio Labs',
    version: '1.0.0',
    state: 'available',
    scopes: ['read-decks', 'access-billing'],
    description:
      'Nightly CSV export of deck engagement metrics into the workspace billing bucket. Requires access-billing scope.',
    installed_at_ms: null,
    installed_by: null,
    last_used_at_ms: null,
    deprecation_notice: null,
  },
  {
    id: 'plg-legacy-flash',
    name: 'Legacy Flash Player',
    publisher: 'Acme Plugins',
    version: '0.3.2',
    state: 'deprecated',
    scopes: ['read-decks'],
    description:
      'Used to embed decks as Flash objects. Superseded by the native HTML viewer in v2.',
    installed_at_ms: NOW - 1000 * 60 * 60 * 24 * 365,
    installed_by: 'admin@acme.com',
    last_used_at_ms: NOW - 1000 * 60 * 60 * 24 * 120,
    deprecation_notice: 'Removed from the embed pipeline on 2026-04-01. Uninstall to free a slot.',
  },
];

const PUBLISH_REQUESTS: PluginPublishRequest[] = [
  {
    id: 'pub-req-001',
    plugin_id: 'plg-ai-summary',
    plugin_name: 'AI Summary',
    publisher: 'OpenBridge',
    submitted_at_ms: NOW - 1000 * 60 * 60 * 18,
    requested_scopes: ['read-decks'],
    status: 'pending',
    reviewed_at_ms: null,
    reviewer: null,
    review_notes: null,
  },
  {
    id: 'pub-req-002',
    plugin_id: 'plg-billing-export',
    plugin_name: 'Billing Export',
    publisher: 'Domio Labs',
    submitted_at_ms: NOW - 1000 * 60 * 60 * 24 * 4,
    requested_scopes: ['read-decks', 'access-billing'],
    status: 'approved',
    reviewed_at_ms: NOW - 1000 * 60 * 60 * 24 * 3,
    reviewer: 'admin@acme.com',
    review_notes: 'Approved for internal billing bucket only.',
  },
  {
    id: 'pub-req-003',
    plugin_id: 'plg-screen-scraper',
    plugin_name: 'Screen Scraper',
    publisher: 'Grey Market',
    submitted_at_ms: NOW - 1000 * 60 * 60 * 24 * 9,
    requested_scopes: ['read-decks', 'write-decks', 'read-users', 'manage-users'],
    status: 'rejected',
    reviewed_at_ms: NOW - 1000 * 60 * 60 * 24 * 8,
    reviewer: 'security@domio.app',
    review_notes:
      'Requested manage-users scope with no legitimate need; flagged as over-privileged.',
  },
];

// ── Read ─────────────────────────────────────────────────────────────────

export async function listPlugins(state?: PluginState): Promise<ReadonlyArray<Plugin>> {
  // simulate light network latency so the loading skeleton flashes.
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  return state ? PLUGINS.filter((p) => p.state === state) : PLUGINS.slice();
}

export async function getPlugin(id: string): Promise<Plugin | null> {
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  return PLUGINS.find((p) => p.id === id) ?? null;
}

export async function listPublishRequests(): Promise<ReadonlyArray<PluginPublishRequest>> {
  await new Promise<void>((resolve) => setTimeout(resolve, 60));
  return PUBLISH_REQUESTS.slice();
}

export async function getPublishRequest(id: string): Promise<PluginPublishRequest | null> {
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  return PUBLISH_REQUESTS.find((r) => r.id === id) ?? null;
}

// ── Mutate ───────────────────────────────────────────────────────────────

export async function enablePlugin(id: string): Promise<Plugin> {
  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) throw new Error(`Plugin ${id} not found`);
  const updated: Plugin = {
    ...plugin,
    state: 'installed',
    installed_at_ms: plugin.installed_at_ms ?? NOW,
    installed_by: plugin.installed_by ?? 'admin@domio.app',
    deprecation_notice: null,
  };
  PLUGINS[PLUGINS.indexOf(plugin)] = updated;
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
  return updated;
}

export async function disablePlugin(id: string): Promise<Plugin> {
  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) throw new Error(`Plugin ${id} not found`);
  const updated: Plugin = {
    ...plugin,
    state: 'deprecated',
    deprecation_notice:
      plugin.deprecation_notice ??
      `Disabled on ${new Date(NOW).toISOString().slice(0, 10)} by admin@domio.app`,
  };
  PLUGINS[PLUGINS.indexOf(plugin)] = updated;
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
  return updated;
}

export async function approvePublishRequest(
  id: string,
  notes: string,
): Promise<PluginPublishRequest> {
  const req = PUBLISH_REQUESTS.find((r) => r.id === id);
  if (!req) throw new Error(`Publish request ${id} not found`);
  const updated: PluginPublishRequest = {
    ...req,
    status: 'approved',
    reviewed_at_ms: NOW,
    reviewer: 'admin@domio.app',
    review_notes: notes,
  };
  PUBLISH_REQUESTS[PUBLISH_REQUESTS.indexOf(req)] = updated;
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
  return updated;
}

export async function rejectPublishRequest(
  id: string,
  notes: string,
): Promise<PluginPublishRequest> {
  const req = PUBLISH_REQUESTS.find((r) => r.id === id);
  if (!req) throw new Error(`Publish request ${id} not found`);
  const updated: PluginPublishRequest = {
    ...req,
    status: 'rejected',
    reviewed_at_ms: NOW,
    reviewer: 'admin@domio.app',
    review_notes: notes,
  };
  PUBLISH_REQUESTS[PUBLISH_REQUESTS.indexOf(req)] = updated;
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
  return updated;
}

// ── Audit log ────────────────────────────────────────────────────────────

export interface PluginAuditEvent {
  readonly timestamp_ms: number;
  readonly action: string;
  readonly actor: string;
}

/**
 * Mock audit log for the plugin detail page. Returns up to 20 events
 * for a given plugin id, deterministic in ordering. Mirrors the real
 * `/v1/audit-events?target_id=…` endpoint that will live behind
 * `getPluginAuditLog` once §S8.4 ships.
 */
export async function getPluginAuditLog(id: string): Promise<ReadonlyArray<PluginAuditEvent>> {
  await new Promise<void>((resolve) => setTimeout(resolve, 60));
  const base = NOW - 1000 * 60 * 60 * 24 * 30;
  const events: PluginAuditEvent[] = [
    { timestamp_ms: base + 1000 * 60 * 5, action: 'plugin.installed', actor: 'admin@acme.com' },
    { timestamp_ms: base + 1000 * 60 * 60 * 12, action: 'plugin.enabled', actor: 'admin@acme.com' },
    { timestamp_ms: base + 1000 * 60 * 60 * 24, action: 'plugin.scope.granted', actor: 'system' },
    {
      timestamp_ms: base + 1000 * 60 * 60 * 48,
      action: 'plugin.scope.granted',
      actor: 'admin@acme.com',
    },
    { timestamp_ms: base + 1000 * 60 * 60 * 60, action: 'plugin.token.rotated', actor: 'system' },
    {
      timestamp_ms: base + 1000 * 60 * 60 * 72,
      action: 'plugin.used',
      actor: 'workspace:acme-sales',
    },
  ];
  // Stable per-id offset so different plugins look distinct.
  const offset = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const out = events.map((e) => ({
    timestamp_ms: e.timestamp_ms + offset * 1000 * 60,
    action: e.action,
    actor: e.actor,
  }));
  // Newest first, capped at 20.
  out.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  return out.slice(0, 20);
}

// ── Display helpers ─────────────────────────────────────────────────────

export const PLUGIN_STATE_TONES: Readonly<
  Record<PluginState, 'success' | 'warning' | 'danger' | 'muted' | 'brand'>
> = {
  installed: 'success',
  available: 'brand',
  deprecated: 'muted',
  'pending-approval': 'warning',
};

export const SCOPE_LABELS: Readonly<Record<PluginScope, string>> = {
  'read-decks': 'Read decks',
  'write-decks': 'Write decks',
  'read-users': 'Read users',
  'send-webhooks': 'Send webhooks',
  'access-billing': 'Access billing',
  'manage-users': 'Manage users',
};
