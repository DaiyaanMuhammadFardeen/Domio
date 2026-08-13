/**
 * Audit-log service — Wave 8 §S8.4.
 *
 * Exposes the read-side of the audit log. The real implementation will
 * page from `/v1/audit-events`; for now we generate a deterministic seed
 * of ~120 events spanning the last 30 days, covering every action type,
 * actor kind, and target type so the viewer has something realistic to
 * render and filter.
 *
 * Filters are applied client-side over the seed. Filtering 120 events is
 * trivially under the 500 ms budget promised in the spec.
 */

import type {
  AuditAction,
  AuditActor,
  AuditActorKind,
  AuditEvent,
  AuditEventList,
  AuditFilter,
} from './types';

// Anchor "now" so the seed is stable across reloads in dev.
// Tests don't rely on absolute dates — only on relative ordering.
const NOW = Date.UTC(2026, 7, 13); // 2026-08-13 — matches today's date in harness.
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Seed data ───────────────────────────────────────────────────────────

interface SeedActor {
  id: string;
  email: string | null;
  kind: AuditActorKind;
}

const ACTORS: ReadonlyArray<SeedActor> = [
  { id: 'u-alice', email: 'alice@domio.app', kind: 'user' },
  { id: 'u-bob', email: 'bob@domio.app', kind: 'user' },
  { id: 'u-carol', email: 'carol@acme.com', kind: 'user' },
  { id: 'u-dave', email: 'dave@initech.io', kind: 'user' },
  { id: 'u-erin', email: 'erin@stark.dev', kind: 'user' },
  { id: 'u-frank', email: 'frank@domio.app', kind: 'user' },
  { id: 'svc-payout-runner', email: 'svc-payout-runner@domio.app', kind: 'service' },
  { id: 'svc-trust-scanner', email: 'svc-trust-scanner@domio.app', kind: 'service' },
  { id: 'svc-legal-bot', email: 'svc-legal-bot@domio.app', kind: 'service' },
  { id: 'sys-housekeeping', email: null, kind: 'system' },
  { id: 'sys-backup', email: null, kind: 'system' },
];

interface EventSpec {
  /** Days before NOW. */
  readonly days_ago: number;
  /** Hours offset within the day, 0–23. */
  readonly hour: number;
  readonly minute: number;
  readonly actor_id: string;
  readonly action: AuditAction;
  readonly target_type: AuditEvent['target_type'];
  readonly target_id: string;
  readonly diff?: { readonly before: unknown; readonly after: unknown };
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

// Stable, hand-crafted mix across the full action / target space.
// ~120 entries spanning all 26 actions and all 9 target types.
const EVENT_SPECS: ReadonlyArray<EventSpec> = [
  // Day -0 (today) — recent, freshest
  { days_ago: 0, hour: 9, minute: 12, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice', metadata: { ip: '10.0.0.4', user_agent: 'Chrome/127' } },
  { days_ago: 0, hour: 9, minute: 18, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-001', metadata: { tenant_id: 'acme', slides: 12 } },
  { days_ago: 0, hour: 9, minute: 41, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-001', metadata: { visibility: 'link', recipient_count: 3 } },
  { days_ago: 0, hour: 10, minute: 3, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-chart-pro', metadata: { version: '1.4.2' } },
  { days_ago: 0, hour: 10, minute: 17, actor_id: 'u-bob', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-okta-acme', metadata: { ok: true, latency_ms: 412 } },
  { days_ago: 0, hour: 10, minute: 38, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-991', metadata: { reason: 'trust_below_threshold', score: 12 } },
  { days_ago: 0, hour: 11, minute: 5, actor_id: 'u-carol', action: 'dlp.rule.updated', target_type: 'dlp-rule', target_id: 'dlp-ssn', metadata: { scopes_changed: 1 }, diff: { before: { enabled: true, scopes: ['comment'] }, after: { enabled: true, scopes: ['comment', 'slide-content'] } } },
  { days_ago: 0, hour: 11, minute: 22, actor_id: 'u-carol', action: 'webhook.subscribed', target_type: 'webhook', target_id: 'wh-77', metadata: { url: 'https://acme.com/hooks/deck', events: 4 } },
  { days_ago: 0, hour: 11, minute: 47, actor_id: 'sys-housekeeping', action: 'residency.changed', target_type: 'residency', target_id: 'res-eu-west', metadata: { region: 'eu-west-1', from: 'us-east-1', to: 'eu-west-1' } },
  { days_ago: 0, hour: 12, minute: 14, actor_id: 'u-dave', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-201', metadata: { scope: 'read', prefix: 'pk_live_a8f3' } },

  // Day -1
  { days_ago: 1, hour: 8, minute: 1, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice', metadata: { ip: '10.0.0.4' } },
  { days_ago: 1, hour: 8, minute: 15, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-001', metadata: { format: 'pdf', size_kb: 1840 } },
  { days_ago: 1, hour: 8, minute: 44, actor_id: 'u-alice', action: 'deck.unshared', target_type: 'deck', target_id: 'd-001', metadata: { recipient_count: 1 } },
  { days_ago: 1, hour: 9, minute: 2, actor_id: 'u-bob', action: 'plugin.disabled', target_type: 'plugin', target_id: 'pln-chart-pro', metadata: { reason: 'compliance_review' } },
  { days_ago: 1, hour: 9, minute: 38, actor_id: 'u-erin', action: 'sso.provider.added', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { protocol: 'oidc' }, diff: { before: null, after: { name: 'Azure AD (stark)', protocol: 'oidc' } } },
  { days_ago: 1, hour: 10, minute: 11, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: false, latency_ms: 1203, error: 'invalid_signature' } },
  { days_ago: 1, hour: 10, minute: 47, actor_id: 'svc-legal-bot', action: 'legal-hold.applied', target_type: 'legal-hold', target_id: 'lh-12', metadata: { scope: 'deck', reason: 'preservation_request', case_id: 'CR-2026-441' } },
  { days_ago: 1, hour: 11, minute: 33, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-187', metadata: { prefix: 'pk_live_44ce' } },
  { days_ago: 1, hour: 13, minute: 9, actor_id: 'u-carol', action: 'dlp.rule.added', target_type: 'dlp-rule', target_id: 'dlp-credit-card', metadata: { kind: 'entity', entity: 'credit_card' } },
  { days_ago: 1, hour: 14, minute: 22, actor_id: 'u-dave', action: 'webhook.unsubscribed', target_type: 'webhook', target_id: 'wh-31', metadata: { reason: 'endpoint_410' } },
  { days_ago: 1, hour: 15, minute: 56, actor_id: 'svc-payout-runner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-stale-204', metadata: { reason: 'soft_delete_30d' } },
  { days_ago: 1, hour: 16, minute: 28, actor_id: 'u-alice', action: 'user.logout', target_type: 'user', target_id: 'u-alice', metadata: { session_minutes: 480 } },

  // Day -2
  { days_ago: 2, hour: 7, minute: 51, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 2, hour: 8, minute: 14, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-002', metadata: { tenant_id: 'acme', slides: 18 } },
  { days_ago: 2, hour: 8, minute: 33, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-002', metadata: { visibility: 'org' } },
  { days_ago: 2, hour: 9, minute: 5, actor_id: 'u-bob', action: 'plugin.enabled', target_type: 'plugin', target_id: 'pln-chart-pro', diff: { before: { enabled: false }, after: { enabled: true } } },
  { days_ago: 2, hour: 9, minute: 47, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-mermaid', metadata: { version: '0.9.0' } },
  { days_ago: 2, hour: 10, minute: 12, actor_id: 'u-carol', action: 'dlp.rule.deleted', target_type: 'dlp-rule', target_id: 'dlp-old-ssn', metadata: { reason: 'replaced_by_dlp-ssn' } },
  { days_ago: 2, hour: 10, minute: 56, actor_id: 'u-dave', action: 'user.invited', target_type: 'user', target_id: 'u-new-31', metadata: { email: 'newbie@initech.io', role: 'editor' } },
  { days_ago: 2, hour: 11, minute: 22, actor_id: 'u-dave', action: 'user.role-changed', target_type: 'user', target_id: 'u-new-31', diff: { before: { role: 'viewer' }, after: { role: 'editor' } } },
  { days_ago: 2, hour: 12, minute: 4, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-872', metadata: { score: 8 } },
  { days_ago: 2, hour: 13, minute: 39, actor_id: 'sys-backup', action: 'residency.changed', target_type: 'residency', target_id: 'res-ap-south', metadata: { region: 'ap-south-1' } },
  { days_ago: 2, hour: 14, minute: 17, actor_id: 'u-frank', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-202', metadata: { scope: 'write', prefix: 'pk_live_b201' } },
  { days_ago: 2, hour: 15, minute: 28, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-002', metadata: { format: 'pptx', size_kb: 2210 } },

  // Day -3
  { days_ago: 3, hour: 8, minute: 9, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 3, hour: 8, minute: 44, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: true, latency_ms: 388 } },
  { days_ago: 3, hour: 9, minute: 21, actor_id: 'u-bob', action: 'plugin.disabled', target_type: 'plugin', target_id: 'pln-mermaid', metadata: { reason: 'user_request' } },
  { days_ago: 3, hour: 9, minute: 47, actor_id: 'svc-legal-bot', action: 'legal-hold.released', target_type: 'legal-hold', target_id: 'lh-09', metadata: { case_id: 'CR-2026-309' } },
  { days_ago: 3, hour: 10, minute: 18, actor_id: 'u-carol', action: 'dlp.rule.added', target_type: 'dlp-rule', target_id: 'dlp-profanity', metadata: { kind: 'dictionary', dictionary: 'profanity_en' } },
  { days_ago: 3, hour: 10, minute: 52, actor_id: 'u-dave', action: 'user.removed', target_type: 'user', target_id: 'u-old-44', metadata: { email: 'departed@initech.io', reason: 'offboarded' } },
  { days_ago: 3, hour: 11, minute: 33, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-155' },
  { days_ago: 3, hour: 13, minute: 11, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-003', metadata: { visibility: 'link' } },
  { days_ago: 3, hour: 14, minute: 28, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-003', metadata: { slides: 8 } },
  { days_ago: 3, hour: 15, minute: 41, actor_id: 'u-erin', action: 'sso.provider.removed', target_type: 'sso-provider', target_id: 'sso-legacy-okta', metadata: { reason: 'tenant_migration' } },
  { days_ago: 3, hour: 16, minute: 9, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-table-plus', metadata: { version: '2.1.0' } },

  // Day -4
  { days_ago: 4, hour: 7, minute: 23, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 4, hour: 8, minute: 2, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-003', metadata: { format: 'pdf' } },
  { days_ago: 4, hour: 8, minute: 47, actor_id: 'u-carol', action: 'dlp.rule.updated', target_type: 'dlp-rule', target_id: 'dlp-profanity', diff: { before: { enabled: true, actions: ['notify'] }, after: { enabled: true, actions: ['block-share', 'notify'] } } },
  { days_ago: 4, hour: 9, minute: 33, actor_id: 'u-dave', action: 'webhook.subscribed', target_type: 'webhook', target_id: 'wh-78', metadata: { events: 6 } },
  { days_ago: 4, hour: 10, minute: 19, actor_id: 'svc-payout-runner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-stale-118', metadata: { reason: 'soft_delete_30d' } },
  { days_ago: 4, hour: 11, minute: 8, actor_id: 'u-frank', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-203' },
  { days_ago: 4, hour: 12, minute: 44, actor_id: 'u-bob', action: 'plugin.enabled', target_type: 'plugin', target_id: 'pln-mermaid' },
  { days_ago: 4, hour: 14, minute: 21, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-660' },
  { days_ago: 4, hour: 15, minute: 33, actor_id: 'u-alice', action: 'user.logout', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 4, hour: 16, minute: 47, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: true, latency_ms: 401 } },

  // Day -5
  { days_ago: 5, hour: 8, minute: 11, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 5, hour: 8, minute: 38, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-004' },
  { days_ago: 5, hour: 9, minute: 14, actor_id: 'u-bob', action: 'plugin.disabled', target_type: 'plugin', target_id: 'pln-table-plus', metadata: { reason: 'security_advisory' } },
  { days_ago: 5, hour: 9, minute: 52, actor_id: 'u-carol', action: 'dlp.rule.deleted', target_type: 'dlp-rule', target_id: 'dlp-legacy-email' },
  { days_ago: 5, hour: 10, minute: 33, actor_id: 'u-dave', action: 'user.invited', target_type: 'user', target_id: 'u-new-32', metadata: { role: 'viewer' } },
  { days_ago: 5, hour: 11, minute: 17, actor_id: 'svc-legal-bot', action: 'legal-hold.applied', target_type: 'legal-hold', target_id: 'lh-13', metadata: { case_id: 'CR-2026-512' } },
  { days_ago: 5, hour: 12, minute: 1, actor_id: 'sys-housekeeping', action: 'residency.changed', target_type: 'residency', target_id: 'res-us-east' },
  { days_ago: 5, hour: 13, minute: 28, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-122' },
  { days_ago: 5, hour: 14, minute: 44, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-004', metadata: { visibility: 'org' } },
  { days_ago: 5, hour: 15, minute: 39, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-403' },

  // Day -6
  { days_ago: 6, hour: 7, minute: 47, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 6, hour: 8, minute: 28, actor_id: 'u-alice', action: 'deck.unshared', target_type: 'deck', target_id: 'd-004' },
  { days_ago: 6, hour: 9, minute: 11, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-lottie-bridge', metadata: { version: '0.6.1' } },
  { days_ago: 6, hour: 9, minute: 48, actor_id: 'u-carol', action: 'dlp.rule.added', target_type: 'dlp-rule', target_id: 'dlp-passport' },
  { days_ago: 6, hour: 10, minute: 23, actor_id: 'u-dave', action: 'webhook.unsubscribed', target_type: 'webhook', target_id: 'wh-44', metadata: { reason: 'endpoint_404' } },
  { days_ago: 6, hour: 11, minute: 14, actor_id: 'svc-payout-runner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-stale-099' },
  { days_ago: 6, hour: 12, minute: 38, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: false, error: 'clock_skew' } },
  { days_ago: 6, hour: 13, minute: 51, actor_id: 'u-frank', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-204' },
  { days_ago: 6, hour: 14, minute: 32, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-004' },
  { days_ago: 6, hour: 15, minute: 18, actor_id: 'svc-legal-bot', action: 'legal-hold.released', target_type: 'legal-hold', target_id: 'lh-10' },

  // Day -7
  { days_ago: 7, hour: 8, minute: 5, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 7, hour: 8, minute: 39, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-005' },
  { days_ago: 7, hour: 9, minute: 22, actor_id: 'u-bob', action: 'plugin.enabled', target_type: 'plugin', target_id: 'pln-lottie-bridge' },
  { days_ago: 7, hour: 10, minute: 8, actor_id: 'u-carol', action: 'dlp.rule.updated', target_type: 'dlp-rule', target_id: 'dlp-passport', diff: { before: { enabled: true }, after: { enabled: false } } },
  { days_ago: 7, hour: 10, minute: 47, actor_id: 'u-dave', action: 'user.role-changed', target_type: 'user', target_id: 'u-new-31', diff: { before: { role: 'editor' }, after: { role: 'admin' } } },
  { days_ago: 7, hour: 11, minute: 33, actor_id: 'sys-backup', action: 'residency.changed', target_type: 'residency', target_id: 'res-eu-central' },
  { days_ago: 7, hour: 12, minute: 17, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-302' },
  { days_ago: 7, hour: 13, minute: 41, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-005' },
  { days_ago: 7, hour: 14, minute: 23, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-098' },
  { days_ago: 7, hour: 15, minute: 56, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: true, latency_ms: 376 } },

  // Day -8
  { days_ago: 8, hour: 7, minute: 33, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 8, hour: 8, minute: 19, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-005' },
  { days_ago: 8, hour: 9, minute: 1, actor_id: 'u-bob', action: 'plugin.disabled', target_type: 'plugin', target_id: 'pln-lottie-bridge' },
  { days_ago: 8, hour: 9, minute: 38, actor_id: 'u-carol', action: 'dlp.rule.added', target_type: 'dlp-rule', target_id: 'dlp-bank-iban' },
  { days_ago: 8, hour: 10, minute: 22, actor_id: 'u-dave', action: 'user.invited', target_type: 'user', target_id: 'u-new-33' },
  { days_ago: 8, hour: 11, minute: 14, actor_id: 'svc-legal-bot', action: 'legal-hold.applied', target_type: 'legal-hold', target_id: 'lh-14' },
  { days_ago: 8, hour: 12, minute: 33, actor_id: 'u-frank', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-205' },
  { days_ago: 8, hour: 13, minute: 27, actor_id: 'u-alice', action: 'deck.unshared', target_type: 'deck', target_id: 'd-005' },
  { days_ago: 8, hour: 14, minute: 51, actor_id: 'svc-payout-runner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-stale-071' },
  { days_ago: 8, hour: 15, minute: 36, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-rangy' },

  // Day -9
  { days_ago: 9, hour: 8, minute: 7, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 9, hour: 8, minute: 41, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-006' },
  { days_ago: 9, hour: 9, minute: 22, actor_id: 'u-carol', action: 'dlp.rule.deleted', target_type: 'dlp-rule', target_id: 'dlp-legacy-iban' },
  { days_ago: 9, hour: 10, minute: 8, actor_id: 'u-dave', action: 'webhook.subscribed', target_type: 'webhook', target_id: 'wh-79' },
  { days_ago: 9, hour: 10, minute: 47, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark' },
  { days_ago: 9, hour: 11, minute: 32, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-211' },
  { days_ago: 9, hour: 12, minute: 18, actor_id: 'sys-housekeeping', action: 'residency.changed', target_type: 'residency', target_id: 'res-ap-southeast' },
  { days_ago: 9, hour: 13, minute: 44, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-006' },
  { days_ago: 9, hour: 14, minute: 27, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-077' },
  { days_ago: 9, hour: 15, minute: 53, actor_id: 'u-bob', action: 'plugin.enabled', target_type: 'plugin', target_id: 'pln-rangy' },

  // Day -10
  { days_ago: 10, hour: 7, minute: 51, actor_id: 'u-alice', action: 'user.login', target_type: 'user', target_id: 'u-alice' },
  { days_ago: 10, hour: 8, minute: 34, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-006' },
  { days_ago: 10, hour: 9, minute: 21, actor_id: 'u-carol', action: 'dlp.rule.updated', target_type: 'dlp-rule', target_id: 'dlp-bank-iban', diff: { before: { scopes: ['slide-content'] }, after: { scopes: ['slide-content', 'asset'] } } },
  { days_ago: 10, hour: 10, minute: 8, actor_id: 'u-dave', action: 'user.removed', target_type: 'user', target_id: 'u-old-45' },
  { days_ago: 10, hour: 10, minute: 47, actor_id: 'svc-legal-bot', action: 'legal-hold.released', target_type: 'legal-hold', target_id: 'lh-11' },
  { days_ago: 10, hour: 11, minute: 31, actor_id: 'u-frank', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-206' },
  { days_ago: 10, hour: 12, minute: 18, actor_id: 'sys-backup', action: 'residency.changed', target_type: 'residency', target_id: 'res-us-west' },
  { days_ago: 10, hour: 13, minute: 42, actor_id: 'u-alice', action: 'deck.unshared', target_type: 'deck', target_id: 'd-006' },
  { days_ago: 10, hour: 14, minute: 33, actor_id: 'svc-payout-runner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-stale-040' },
  { days_ago: 10, hour: 15, minute: 19, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark', metadata: { ok: true } },

  // Day -14
  { days_ago: 14, hour: 9, minute: 11, actor_id: 'u-alice', action: 'deck.created', target_type: 'deck', target_id: 'd-007' },
  { days_ago: 14, hour: 9, minute: 48, actor_id: 'u-bob', action: 'plugin.installed', target_type: 'plugin', target_id: 'pln-markmap' },
  { days_ago: 14, hour: 10, minute: 23, actor_id: 'u-carol', action: 'dlp.rule.added', target_type: 'dlp-rule', target_id: 'dlp-medical-terms' },
  { days_ago: 14, hour: 11, minute: 12, actor_id: 'u-dave', action: 'apikey.created', target_type: 'apikey', target_id: 'ak-180' },
  { days_ago: 14, hour: 12, minute: 41, actor_id: 'svc-trust-scanner', action: 'deck.deleted', target_type: 'deck', target_id: 'd-old-118' },

  // Day -20
  { days_ago: 20, hour: 8, minute: 7, actor_id: 'u-alice', action: 'deck.shared', target_type: 'deck', target_id: 'd-007' },
  { days_ago: 20, hour: 8, minute: 47, actor_id: 'u-bob', action: 'plugin.enabled', target_type: 'plugin', target_id: 'pln-markmap' },
  { days_ago: 20, hour: 9, minute: 33, actor_id: 'u-carol', action: 'dlp.rule.deleted', target_type: 'dlp-rule', target_id: 'dlp-old-medical' },
  { days_ago: 20, hour: 10, minute: 21, actor_id: 'u-erin', action: 'sso.test-login', target_type: 'sso-provider', target_id: 'sso-azure-stark' },
  { days_ago: 20, hour: 11, minute: 47, actor_id: 'svc-legal-bot', action: 'legal-hold.applied', target_type: 'legal-hold', target_id: 'lh-15' },

  // Day -28
  { days_ago: 28, hour: 9, minute: 14, actor_id: 'u-alice', action: 'deck.exported', target_type: 'deck', target_id: 'd-007' },
  { days_ago: 28, hour: 9, minute: 51, actor_id: 'u-bob', action: 'plugin.disabled', target_type: 'plugin', target_id: 'pln-markmap' },
  { days_ago: 28, hour: 10, minute: 33, actor_id: 'u-dave', action: 'user.invited', target_type: 'user', target_id: 'u-new-34' },
  { days_ago: 28, hour: 11, minute: 18, actor_id: 'u-frank', action: 'apikey.revoked', target_type: 'apikey', target_id: 'ak-041' },
  { days_ago: 28, hour: 12, minute: 47, actor_id: 'sys-housekeeping', action: 'residency.changed', target_type: 'residency', target_id: 'res-eu-north' },
];

function traceIdFor(seed: number): string {
  // 32-hex-char trace id, deterministic per seed index.
  const hex = (seed * 2654435761) >>> 0;
  const base = hex.toString(16).padStart(8, '0');
  return `${base}${base}${base}${base}`.slice(0, 32);
}

function buildEvent(spec: EventSpec, index: number): AuditEvent {
  const actor = ACTORS.find((a) => a.id === spec.actor_id);
  if (!actor) {
    throw new Error(`Unknown actor ${spec.actor_id}`);
  }
  const ts = NOW - spec.days_ago * DAY_MS + spec.hour * 60 * 60_000 + spec.minute * 60_000;
  const auditActor: AuditActor = {
    id: actor.id,
    email: actor.email,
    kind: actor.kind,
  };
  return {
    id: `ev-${String(index + 1).padStart(4, '0')}`,
    trace_id: traceIdFor(index + 1),
    timestamp_ms: ts,
    actor: auditActor,
    action: spec.action,
    target_type: spec.target_type,
    target_id: spec.target_id,
    diff: spec.diff ? { before: spec.diff.before, after: spec.diff.after } : null,
    metadata: spec.metadata ?? {},
  };
}

const EVENTS: ReadonlyArray<AuditEvent> = EVENT_SPECS.map((s, i) => buildEvent(s, i));

// ── Public API ──────────────────────────────────────────────────────────

function applyFilter(events: ReadonlyArray<AuditEvent>, filter: AuditFilter): AuditEvent[] {
  return events.filter((e) => {
    if (filter.actor_id !== undefined && e.actor.id !== filter.actor_id) return false;
    if (filter.action !== undefined && e.action !== filter.action) return false;
    if (filter.target_type !== undefined && e.target_type !== filter.target_type) return false;
    if (filter.from_ms !== undefined && e.timestamp_ms < filter.from_ms) return false;
    if (filter.to_ms !== undefined && e.timestamp_ms > filter.to_ms) return false;
    return true;
  });
}

export async function listAuditEvents(filter: AuditFilter = {}): Promise<AuditEventList> {
  const items = applyFilter(EVENTS, filter);
  // Most-recent first — matches what an operator scanning a log expects.
  items.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  return { items, total: items.length };
}

function csvEscape(value: string): string {
  // Escape double-quotes by doubling them and wrap fields that contain
  // commas, quotes, or newlines in quotes. Newlines in metadata are
  // collapsed to spaces first to keep one logical CSV row per event.
  const safe = value.replace(/[\r\n]+/g, ' ');
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toCsvCell(event: AuditEvent, key: 'timestamp' | 'actor_email' | 'action' | 'target_type' | 'target_id' | 'trace_id'): string {
  switch (key) {
    case 'timestamp':
      return new Date(event.timestamp_ms).toISOString();
    case 'actor_email':
      return event.actor.email ?? '';
    case 'action':
      return event.action;
    case 'target_type':
      return event.target_type;
    case 'target_id':
      return event.target_id;
    case 'trace_id':
      return event.trace_id;
  }
}

export async function exportAuditEventsCSV(filter: AuditFilter = {}): Promise<string> {
  const list = await listAuditEvents(filter);
  const headers: ReadonlyArray<'timestamp' | 'actor_email' | 'action' | 'target_type' | 'target_id' | 'trace_id'> = [
    'timestamp',
    'actor_email',
    'action',
    'target_type',
    'target_id',
    'trace_id',
  ];
  const lines: string[] = [];
  lines.push(headers.join(','));
  for (const event of list.items) {
    const row = headers.map((h) => csvEscape(toCsvCell(event, h))).join(',');
    lines.push(row);
  }
  return lines.join('\n');
}

export async function getAuditEvent(id: string): Promise<AuditEvent | null> {
  return EVENTS.find((e) => e.id === id) ?? null;
}

export const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = [
  'user.login',
  'user.logout',
  'user.invited',
  'user.removed',
  'user.role-changed',
  'deck.created',
  'deck.deleted',
  'deck.shared',
  'deck.unshared',
  'deck.exported',
  'sso.provider.added',
  'sso.provider.removed',
  'sso.test-login',
  'dlp.rule.added',
  'dlp.rule.updated',
  'dlp.rule.deleted',
  'plugin.installed',
  'plugin.disabled',
  'plugin.enabled',
  'apikey.created',
  'apikey.revoked',
  'webhook.subscribed',
  'webhook.unsubscribed',
  'residency.changed',
  'legal-hold.applied',
  'legal-hold.released',
];

export const ALL_AUDIT_TARGET_TYPES: ReadonlyArray<AuditEvent['target_type']> = [
  'deck',
  'user',
  'plugin',
  'sso-provider',
  'webhook',
  'apikey',
  'residency',
  'legal-hold',
  'dlp-rule',
];
