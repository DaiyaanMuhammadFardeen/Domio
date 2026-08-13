/**
 * TypeScript types derived from contracts/openapi/v1/marketplace-service.yaml.
 * Admin console uses a subset of the marketplace schemas.
 */

// ── Marketplace Listing ─────────────────────────────────────────────────
export interface MarketplaceListing {
  id: string;
  catalog_id: string;
  seller_id: string;
  title: string;
  description: string;
  status: 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';
  is_free: boolean;
  price_cents: number;
  currency: string;
  tags: string[];
  preview?: { poster_ref?: string; loop_ref?: string };
  published_at_ms?: number;
  deprecated_at_ms?: number;
  version?: string;
  created_at: number;
  updated_at: number;
}

// ── Brand Lock ──────────────────────────────────────────────────────────
export type BrandLockState = 'allow' | 'deny' | 'override';

export interface BrandLock {
  id: string;
  tenant_id: string;
  brand_kit_id: string;
  marketplace_listing_id: string;
  state: BrandLockState;
  override_price_cents: number | null;
  notes: string | null;
  created_at: number;
}

export interface BrandLockList {
  items: BrandLock[];
  total: number;
}

export interface BrandLockInput {
  tenant_id: string;
  brand_kit_id: string;
  marketplace_listing_id: string;
  state: BrandLockState;
  override_price_cents?: number;
  notes?: string;
}

// ── Curated Listing ─────────────────────────────────────────────────────
export interface CuratedListing {
  listing_id: string;
  title: string;
  slug: string;
  is_free: boolean;
  price_cents: number;
  currency: string;
  override_price_cents: number | null;
  brand_locked_state: 'allow' | 'override';
}

export interface CuratedListingPage {
  items: CuratedListing[];
  total: number;
}

// ── Takedown ────────────────────────────────────────────────────────────
export type TakedownKind = 'dmca' | 'trademark' | 'policy';
export type TakedownStatus =
  | 'received'
  | 'in_review'
  | 'confirmed'
  | 'dismissed'
  | 'counter_notice'
  | 'resolved';

export interface TakedownRequest {
  request_id: string;
  listing_id: string;
  claimant_id: string;
  kind: TakedownKind;
  evidence_url: string | null;
  statement: string;
  status: TakedownStatus;
  resolution_notes: string | null;
  submitted_at: number;
  resolved_at: number | null;
}

export interface TakedownRequestList {
  items: TakedownRequest[];
  total: number;
}

export interface ResolveTakedownInput {
  decision: 'confirmed' | 'dismissed';
  resolution_notes?: string;
}

export interface CounterNoticeInput {
  statement: string;
}

// ── Payout ──────────────────────────────────────────────────────────────
export interface PayoutPolicy {
  split_creator_bps: number;
  split_platform_bps: number;
  min_payout_cents: number;
  first_payout_hold_days: number;
  updated_at: number;
}

export type PayoutRunStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PayoutRun {
  id: string;
  period_month: string;
  status: PayoutRunStatus;
  total_creators: number;
  total_payout_cents: number;
  currency: string;
  created_at_ms: number;
  completed_at_ms: number | null;
}

// ── Custom Domain ──────────────────────────────────────────────────────
//
// Per Wave 3 §S3.5 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
//
// Each tenant can register one or more custom domains for their viewer
// links. Verification is via CNAME DNS record pointing at
// `cname.domio.app`. SSL provisioning happens once `verified` flips to
// `true`. After that, share links for that tenant are rewritten to use
// the custom domain.

export type CustomDomainState =
  | 'pending_dns' // awaiting CNAME creation
  | 'verifying' // DNS detected, propagating
  | 'verified' // live + SSL provisioned
  | 'failed' // DNS error / validation failed
  | 'revoked'; // removed; links revert to deck.domio.app

export interface CustomDomain {
  id: string;
  tenant_id: string;
  workspace_id: string;
  /** Fully-qualified hostname, e.g. `decks.acme.com`. */
  hostname: string;
  state: CustomDomainState;
  /** Where the CNAME must point. */
  cname_target: string;
  /** Last DNS check timestamp (epoch ms). */
  last_checked_at_ms: number | null;
  /** Human-readable note about the latest check. */
  last_check_note: string | null;
  /** When the domain first went verified (epoch ms). */
  verified_at_ms: number | null;
  /** Free-form tags / project label for filtering. */
  label: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface CustomDomainList {
  items: CustomDomain[];
  total: number;
}

export interface CustomDomainInput {
  tenant_id: string;
  workspace_id: string;
  hostname: string;
  label?: string;
}

export interface CustomDomainVerifyResult {
  domain: CustomDomain;
  /** True when DNS resolves to the expected CNAME target. */
  cname_ok: boolean;
  /** True when an A record falls back to a Domio IP range. */
  a_record_ok: boolean;
  /** Diagnostic message from the verifier. */
  message: string;
}

// ── Problem Detail (RFC-7807) ───────────────────────────────────────────
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

// ── Headless Rendering (Wave 8 §S8.11) ──────────────────────────────────
//
// Live state of the headless render queue: throughput, recent jobs and
// per-tenant configuration. The real endpoints will live at
//   GET /v1/admin/rendering/queue
//   GET /v1/admin/rendering/samples
//   GET /v1/admin/rendering/config
//   PUT /v1/admin/rendering/config
//   POST /v1/admin/rendering/samples/:id/cancel
// Until those land we fall back to deterministic local seed data so
// the admin console UI and tests have something to render.

export type RenderJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface RenderThroughputPoint {
  readonly timestamp_ms: number;
  readonly jobs_per_minute: number;
  readonly errors_per_minute: number;
}

export interface RenderSample {
  readonly id: string;
  readonly deck_id: string;
  readonly status: RenderJobStatus;
  readonly started_at_ms: number;
  readonly completed_at_ms: number | null;
  readonly duration_ms: number | null;
  readonly output_format: 'pdf' | 'png' | 'mp4';
  readonly error: string | null;
}

export interface RenderConfig {
  readonly tenant_id: string;
  readonly max_parallelism: number;
  readonly retention_days: number;
  readonly rate_limit_per_tenant: number; // jobs per minute
}

export interface RenderQueueStatus {
  readonly queued: number;
  readonly running: number;
  readonly succeeded_1h: number;
  readonly failed_1h: number;
  readonly avg_duration_ms_1h: number;
  readonly error_rate_1h: number; // 0..1
  readonly throughput: ReadonlyArray<RenderThroughputPoint>;
}

// ── Legal Hold (Wave 8 §S8.6) ───────────────────────────────────────────
//
// Immutable holds attached to a deck, workspace, or user. Held items
// cannot be deleted until the hold is explicitly released. Used to
// satisfy litigation and compliance freeze requests.

export type LegalHoldTargetKind = 'deck' | 'workspace' | 'user';
export type LegalHoldStatus = 'active' | 'released';

export interface LegalHold {
  readonly id: string;
  readonly tenant_id: string;
  readonly target_kind: LegalHoldTargetKind;
  readonly target_id: string;
  readonly target_label: string;
  readonly reason: string;
  readonly status: LegalHoldStatus;
  readonly applied_at_ms: number;
  readonly applied_by: string;
  readonly released_at_ms: number | null;
  readonly released_by: string | null;
  readonly release_notes: string | null;
}

export interface LegalHoldInput {
  readonly target_kind: LegalHoldTargetKind;
  readonly target_id: string;
  readonly reason: string;
}

// ── Retention Policy (Wave 8 §S8.6) ─────────────────────────────────────
//
// Per-content-type retention period. Items under an active legal hold
// are exempt and counted separately in the policy's `exemptions` field.

export type RetentionContentType = 'deck' | 'asset' | 'comment' | 'audit-log' | 'export';
export type RetentionPeriod = '30d' | '90d' | '1y' | '3y' | '7y' | 'indefinite';

export interface RetentionPolicy {
  readonly id: string;
  readonly tenant_id: string;
  readonly content_type: RetentionContentType;
  readonly period: RetentionPeriod;
  readonly updated_at_ms: number;
  readonly updated_by: string;
  readonly exemptions: number;
}

export interface RetentionPolicyInput {
  readonly content_type: RetentionContentType;
  readonly period: RetentionPeriod;
}

export interface RetentionPreview {
  readonly policy_id: string;
  readonly affected_decks: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly last_modified_ms: number;
    readonly days_until_purge: number;
  }>;
  readonly total_affected: number;
}

// ── Data Residency (Wave 8 §S8.5) ───────────────────────────────────────
//
// Each tenant can pin workspaces to a region (data-residency) and
// migrate them to another region. Migrations are queued, estimated
// against current storage, and tracked as `MigrationPlan` records.
//
// Real endpoints will live under `/v1/admin/residency/*` once the
// governance service catches up; until then we fall back to a
// deterministic in-memory store.

export type Region =
  | 'us-east'
  | 'us-west'
  | 'eu-west'
  | 'eu-central'
  | 'ap-south'
  | 'ap-northeast'
  | 'sa-east';

export interface RegionInfo {
  readonly id: Region;
  readonly label: string;
  readonly city: string;
  readonly country: string;
  readonly count_workspaces: number;
  readonly storage_gb: number;
}

export interface WorkspaceResidency {
  readonly workspace_id: string;
  readonly workspace_name: string;
  readonly region: Region;
  readonly storage_gb: number;
  readonly last_migrated_at_ms: number | null;
  readonly residency_locked: boolean;
}

export interface MigrationPlan {
  readonly id: string;
  readonly workspace_id: string;
  readonly from_region: Region;
  readonly to_region: Region;
  readonly estimated_storage_gb: number;
  readonly estimated_cost_cents: number;
  readonly estimated_downtime_minutes: number;
  readonly status: 'preview' | 'in_progress' | 'completed' | 'failed';
  readonly progress_pct: number;
  readonly created_at_ms: number;
  readonly started_at_ms: number | null;
  readonly completed_at_ms: number | null;
}

export interface MigrationPlanRequest {
  readonly workspace_id: string;
  readonly to_region: Region;
}

// ── Public API & SDK (Wave 8 §S8.8) ────────────────────────────────────
//
// REST API keys + webhook subscriptions surfaced in the admin console.
// The real implementation lives in the platform-api service; until the
// endpoint contracts land we expose deterministic local seed data so the
// admin-console UI and tests have something to render.

export type APIKeyScope =
  | 'read-only'
  | 'read-write'
  | 'agent-only'
  | 'admin'
  | 'export';

export interface APIKey {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<APIKeyScope>;
  /** First 8 characters of the secret — visible at all times. */
  readonly prefix: string;
  readonly created_at_ms: number;
  readonly created_by: string;
  readonly last_used_at_ms: number | null;
  readonly expires_at_ms: number | null;
  readonly revoked: boolean;
}

export interface APIKeyCreateResult {
  readonly key: APIKey;
  /** Full secret, returned only at creation time. */
  readonly secret: string;
}

export interface APIKeyInput {
  readonly name: string;
  readonly scopes: ReadonlyArray<APIKeyScope>;
  readonly expires_at_ms?: number;
}

export type WebhookEventType =
  | 'deck.published'
  | 'deck.shared'
  | 'deck.unshared'
  | 'user.invited'
  | 'user.removed'
  | 'audit.event'
  | 'sso.test-login'
  | 'plugin.installed'
  | 'plugin.disabled';

export interface Webhook {
  readonly id: string;
  readonly tenant_id: string;
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEventType>;
  readonly secret_rotated_at_ms: number | null;
  readonly retry_policy: { readonly max_retries: number; readonly backoff_seconds: number };
  readonly enabled: boolean;
  readonly last_delivery_at_ms: number | null;
  readonly last_delivery_status: number | null;
  readonly created_at_ms: number;
}

export interface WebhookDelivery {
  readonly id: string;
  readonly webhook_id: string;
  readonly event: WebhookEventType;
  readonly attempt: number;
  readonly status_code: number | null;
  readonly delivered_at_ms: number | null;
  readonly response_body_excerpt: string | null;
}

export interface WebhookInput {
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEventType>;
  readonly retry_policy: { readonly max_retries: number; readonly backoff_seconds: number };
}

// ── Seat Analytics (Wave 8 §S8.7) ───────────────────────────────────────
//
// Per-tenant license summary, daily seat usage history, and per-user
// activity roll-up. Real endpoints will live at
//   GET /v1/admin/seats/license
//   GET /v1/admin/seats/usage?days=N
//   GET /v1/admin/seats/users
// but the admin console falls back to deterministic seed data while
// those endpoints land.

export type LicenseTier = 'free' | 'starter' | 'team' | 'business' | 'enterprise';

export interface LicenseSummary {
  readonly tier: LicenseTier;
  readonly seats_total: number;
  readonly seats_used: number;
  readonly seats_available: number;
  readonly renews_at_ms: number | null;
  readonly monthly_cost_cents: number;
}

export interface SeatUsagePoint {
  readonly date_ms: number;
  readonly seats_used: number;
}

export interface UserActivity {
  readonly user_id: string;
  readonly email: string;
  readonly name: string;
  readonly last_active_at_ms: number | null;
  readonly decks_created: number;
  readonly shares_sent: number;
  readonly minutes_presenting: number;
  readonly role: 'admin' | 'editor' | 'viewer' | 'guest';
}

// ── Plugins (Wave 8 §S8.9) ──────────────────────────────────────────────
//
// Tenant marketplace for first-party and third-party plugins. Plugins
// declare scopes they need (read-decks, write-decks, send-webhooks,
// etc); an admin must approve any plugin requesting privileged scopes
// before it can be installed.

export type PluginState = 'installed' | 'available' | 'deprecated' | 'pending-approval';

export type PluginScope =
  | 'read-decks'
  | 'write-decks'
  | 'read-users'
  | 'send-webhooks'
  | 'access-billing'
  | 'manage-users';

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly version: string;
  readonly state: PluginState;
  readonly scopes: ReadonlyArray<PluginScope>;
  readonly description: string;
  readonly installed_at_ms: number | null;
  readonly installed_by: string | null;
  readonly last_used_at_ms: number | null;
  readonly deprecation_notice: string | null;
}

export interface PluginPublishRequest {
  readonly id: string;
  readonly plugin_id: string;
  readonly plugin_name: string;
  readonly publisher: string;
  readonly submitted_at_ms: number;
  readonly requested_scopes: ReadonlyArray<PluginScope>;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly reviewed_at_ms: number | null;
  readonly reviewer: string | null;
  readonly review_notes: string | null;
}

// ── Component SDK (Wave 8 §S8.10) ───────────────────────────────────────
//
// Per-tenant landing for the Domio component SDK. Lists the installed
// package metadata across npm/pnpm/yarn/maven/pip/go/cargo, the
// available starter templates, and a "publish to org library" form
// that lets an admin publish a custom component to their org's
// component library. Until the real
// `/v1/admin/component-sdk/{packages,templates,publish}` endpoints
// land, this service exposes deterministic local seed data.

export type SDKPackage = 'npm' | 'pnpm' | 'yarn' | 'maven' | 'pip' | 'go' | 'cargo';
export type SDKStatus = 'stable' | 'beta' | 'deprecated';

export interface SDKPackageInfo {
  readonly id: string;
  readonly package: SDKPackage;
  readonly package_name: string;
  readonly install_command: string;
  readonly version: string;
  readonly status: SDKStatus;
  readonly docs_url: string;
}

export interface ComponentTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly language: 'typescript' | 'javascript' | 'python';
  readonly framework: 'react' | 'vue' | 'no-framework';
  readonly zip_url: string;
  readonly preview_url: string;
}

// ── Audit Log (Wave 8 §S8.4) ────────────────────────────────────────────
//
// Append-only trail of every privileged action taken in the admin
// console, including actions performed by services or system jobs.
// Filters are applied client-side over the seed in this phase; the
// real endpoint will live at `/v1/audit-events`.

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.invited'
  | 'user.removed'
  | 'user.role-changed'
  | 'deck.created'
  | 'deck.deleted'
  | 'deck.shared'
  | 'deck.unshared'
  | 'deck.exported'
  | 'sso.provider.added'
  | 'sso.provider.removed'
  | 'sso.test-login'
  | 'dlp.rule.added'
  | 'dlp.rule.updated'
  | 'dlp.rule.deleted'
  | 'plugin.installed'
  | 'plugin.disabled'
  | 'plugin.enabled'
  | 'apikey.created'
  | 'apikey.revoked'
  | 'webhook.subscribed'
  | 'webhook.unsubscribed'
  | 'residency.changed'
  | 'legal-hold.applied'
  | 'legal-hold.released';

export type AuditActorKind = 'user' | 'service' | 'system';

export interface AuditActor {
  readonly id: string;
  readonly email: string | null;
  readonly kind: AuditActorKind;
}

export interface AuditEvent {
  readonly id: string;
  readonly trace_id: string;
  readonly timestamp_ms: number;
  readonly actor: AuditActor;
  readonly action: AuditAction;
  readonly target_type:
    | 'deck'
    | 'user'
    | 'plugin'
    | 'sso-provider'
    | 'webhook'
    | 'apikey'
    | 'residency'
    | 'legal-hold'
    | 'dlp-rule';
  readonly target_id: string;
  readonly diff: { readonly before: unknown; readonly after: unknown } | null;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AuditEventList {
  items: AuditEvent[];
  total: number;
}

export interface AuditFilter {
  readonly actor_id?: string;
  readonly action?: AuditAction;
  readonly target_type?: AuditEvent['target_type'];
  readonly from_ms?: number;
  readonly to_ms?: number;
}

// ── DLP (Data Loss Prevention) — Wave 8 §S8.3 ──────────────────────────
//
// Rules scan deck titles, slide content, comments and assets for
// sensitive patterns (regex, dictionary terms, or entity types like
// emails/phones/SSNs) and trigger actions: block sharing, redact, or
// notify the workspace owner.

export type DLPPatternKind = 'regex' | 'dictionary' | 'entity';
export type DLPScope = 'deck-title' | 'slide-content' | 'comment' | 'asset';
export type DLPAction = 'block-share' | 'redact' | 'notify';

export interface DLPRule {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly kind: DLPPatternKind;
  /** regex source | dictionary id | entity type */
  readonly pattern: string;
  readonly scopes: ReadonlyArray<DLPScope>;
  readonly actions: ReadonlyArray<DLPAction>;
  readonly enabled: boolean;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly hits_24h: number;
}

export interface DLPRuleList {
  items: DLPRule[];
  total: number;
}

export interface DLPRuleInput {
  readonly name: string;
  readonly kind: DLPPatternKind;
  readonly pattern: string;
  readonly scopes: ReadonlyArray<DLPScope>;
  readonly actions: ReadonlyArray<DLPAction>;
  readonly enabled: boolean;
}

export interface DLPTestResult {
  readonly rule_id: string;
  readonly matched: boolean;
  readonly matches: ReadonlyArray<{
    readonly start: number;
    readonly end: number;
    readonly snippet: string;
  }>;
  readonly latency_ms: number;
}

// ── SSO (Wave 8 §S8.1) ──────────────────────────────────────────────────
//
// SAML and OIDC identity provider configuration per tenant.
// Real implementation: GET /v1/admin/sso/providers, POST …/providers,
// POST …/providers/:id/test-login. Until those land we fall back to a
// deterministic local seed so the admin console UI and tests have
// something to render.

export type SSOProtocol = 'saml' | 'oidc';

export type SSOProviderStatus = 'connected' | 'degraded' | 'disconnected' | 'pending';

export interface SSORoleMapping {
  readonly sso_role: string;
  readonly domio_role: string;
}

export interface SSOProvider {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly protocol: SSOProtocol;
  readonly metadata_url: string | null;
  readonly entity_id: string;
  readonly acs_url: string;
  readonly role_mapping: ReadonlyArray<SSORoleMapping>;
  readonly status: SSOProviderStatus;
  readonly last_sync_at_ms: number | null;
  readonly error_count_24h: number;
  readonly created_at_ms: number;
}

export interface SSOTestLoginRequest {
  readonly provider_id: string;
  readonly subject_email: string;
}

export interface SSOTestLoginResult {
  readonly ok: boolean;
  readonly resolved_subject: string | null;
  readonly resolved_roles: ReadonlyArray<string>;
  readonly latency_ms: number;
  readonly error: string | null;
}

// ── SCIM (Wave 8 §S8.1) ─────────────────────────────────────────────────
//
// SCIM v2 bearer tokens used by tenant identity providers to provision
// and de-provision users. The token secret is only ever returned at
// creation time; the list endpoint shows only the prefix.

export interface SCIMToken {
  readonly id: string;
  readonly tenant_id: string;
  readonly endpoint_url: string;
  readonly token_prefix: string;
  readonly created_at_ms: number;
  readonly last_used_at_ms: number | null;
  readonly expires_at_ms: number | null;
}

export interface SCIMTokenCreateResult {
  readonly token: SCIMToken;
  readonly token_secret: string;
}

