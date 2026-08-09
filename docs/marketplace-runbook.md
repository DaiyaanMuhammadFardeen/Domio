# Domio Marketplace Runbook (Phase 19)

Status: **Phase 19 complete (2026-08-09)** — all 9 workstreams WS-MKT-1..9 shipped across 5 waves. Wave 1: Foundation + core domain. Wave 2: Money-moving (checkout, refund, chargeback). Wave 3: Creator economy (onboarding, KYC, payouts, FX, analytics). Wave 4: Trust, curation, integrations. Wave 5: Frontend (marketplace-web, creator-console, admin-console, editor panel, i18n).

## What Wave 1 shipped

### Feature flags
- `infrastructure/feature-flags/phase-19.yaml` — 16 flags, all default `false`, owner `marketplace-team`:
  `marketplace.storefront`, `.creator`, `.reviews`, `.pricing`, `.subscription`, `.refund`, `.chargeback`, `.curated`, `.kyc`, `.payout`, `.analytics`, `.takedown`, `.partner_api`, `.mcp`, `.webhooks`, `.audit`.
- Enforcement: boot-time env kill-switch `FEATURE_<GROUP>_<NAME>_DISABLED` → `FeatureDisabledError` → 503 (P18 pattern).

### Migrations (0079–0086, RLS tenant-isolation pattern)
- `0079_phase19_creator` — `creator_profile` (user_id UNIQUE, display_name, slug UNIQUE, bio, country_code, payout_method, payout_ready, kyc_status, balance_cents, currency), `creator_payout_method` (kind stripe_connect|bkash|nagad|bank, external_account_id, verified, metadata), `kyc_session` (vendor, vendor_session_id, status, last_polled_at, raw). User-scoped (no RLS).
- `0080_phase19_brand_locked` — `brand_locked_listing` (workspace_id, brand_kit_id, marketplace_listing_id FK, state allow|deny|override, override_price_cents, notes, audit_actor_id, UNIQUE(workspace,brand,listing)). Workspace RLS.
- `0081_phase19_payments` — `payment_intent` (buyer_id, listing_id FK, purchase_id, provider, provider_intent_id, currency, gross/tax/fee/net_cents bigint, fx_rate numeric(18,8), fx_timestamp, status, idempotency_key, UNIQUE(workspace_id,idempotency_key)); `subscription` (listing_id, buyer_id, provider_subscription_id, status, current_period_end, cancel_at_period_end). Workspace RLS.
- `0082_phase19_payout` — `payout_ledger_entry` (creator_id FK, period_month, event_id FK→revenue_share_event, gross/fee/net_cents, currency, status pending|paid|held|failed|refunded, provider, provider_transfer_id, executor_run_id, UNIQUE(executor_run_id,event_id)); `payout_run`. Workspace RLS.
- `0083_phase19_finance` — `fx_rate` (base, quote, rate numeric(18,8), fetched_at, source, UNIQUE(base,quote,fetched_at); GLOBAL no RLS); `tax_record` (payment_intent_id FK, country_code, tax_type, rate, tax_cents, currency, computed_at). Workspace RLS.
- `0084_phase19_takedown` — `takedown_request` (listing_id FK, claimant_id, kind dmca|trademark|policy, evidence_url, statement, status received|in_review|confirmed|dismissed|counter_notice|resolved, resolution_notes, submitted_at, resolved_at); `trust_score` (listing_id FK, score numeric(5,4), signals jsonb, computed_at; GLOBAL no RLS). Workspace RLS for takedown_request.
- `0085_phase19_audit` — `marketplace_audit_event` (actor_id, actor_type user|agent|system, actor_kind human|agent, event_kind purchase|refund|payout|takedown|kyc|brand_lock_curation|agent_purchase, event_type, payload jsonb, seq, prev_hash, hash, kid, recorded_at, UNIQUE(workspace_id,event_kind,seq) + UNIQUE(workspace_id,event_kind,hash) — hash-chain mirrors 0040). Workspace RLS.
- `0086_phase19_seed_payout_policy` — `payout_policy` singleton seeded 1 row: split_creator_bps 7000, split_platform_bps 3000, min_payout_cents 5000 ($50), first_payout_hold_days 30. GLOBAL no RLS.

### Contracts
- Protos (`contracts/proto/domio/v1/`): `marketplace_billing.proto` (PaymentIntent/Subscription/PayoutLedgerEntry/PayoutRun/PayoutPolicy + provider/status enums), `marketplace_creator.proto` (CreatorProfile/CreatorPayoutMethod/KycSession), `marketplace_curated.proto` (BrandLockedListing + BrandLockState), `marketplace_takedown.proto` (TakedownRequest/TrustScore + TakedownKind/TakedownStatus). proto3, package domio.v1, go_package `github.com/domio/platform/gen/go/domio/v1;domiov1`.
- Schema JSON (`contracts/schema/v1/`): `marketplace-license-v1.schema.json` (LicenseGrant, scopes single_seat|team_n_seats|enterprise_pool), `marketplace-payout-v1.schema.json`, `creator-profile-v1.schema.json`.
- Webhook catalog `contracts/webhooks/marketplace-v1.events.json` — 9 events: listing.published, listing.updated, order.created, order.refunded, payout.eligible, payout.paid, payout.held, takedown.filed, takedown.resolved (canonical envelope).
- OpenAPI `contracts/openapi/v1/marketplace-service.yaml` — 13 paths / 16 operationIds, tags [marketplace-listings, marketplace-pricing, marketplace-reviews, marketplace-curated].

### Services
- `services/marketplace` (`@domio/marketplace-service`) — **138 tests**, typecheck clean. Listing CRUD + lifecycle transitions (draft→in_review→published→deprecated/removed matching P06 registry), listing versions + changelog, pricing calculator (integer cents, 70/30 split floor rounding, free/enterprise_quote, USD|BDT|EUR), reviews (verified-buyer gate, rating 1-5, body ≤4KB, reply-once, report), payout policy read, curated stub. Full pg DML + withTransaction. 16 handlers matching the 16 operationIds exactly. Self-contained HMAC-SHA256 audit recorder (prev_hash chain, kid='mk1').

### Follow-ups (deferred to later waves)
1. P06 `payout_executor_enabled` flag is doc-only (never wired in code) — the payout-executor worker (Wave 3) drives payouts; wire the flag to gate it.
2. Verified-buyer review gate uses in-memory license check — real `license_grant` lookup still deferred (post-checkout grants exist in store, not queried by review gate).
3. `getCuratedMarketplaceListings` returns `[]` stub — real brand-locked curated logic in Wave 4 (WS-MKT-5).
4. Real vendor adapters (Stripe/bKash/Nagad/KYC/FX) are external — sandbox providers + narrow interfaces now, real providers later (P18 vendor-adapter pattern).
5. Migrations 0079–0090 not yet applied to a live DB (no local Postgres in authoring environment) — run `make migrate-up` before exercising services.
6. KYC: real Persona/Sumsub vendor (SandboxKycClient deterministic), kyc-webhook receiver, `kyc_session` status domain value 'submitted' vs DB CHECK 'started' mapping is intentional (pg_store handles mapping).
7. Payout: payout-executor uses injected InMemoryPayoutProvider — real Stripe Connect Transfer / bKash Disburse / Nagad Disburse adapters later; statement_record payload is structured JSON (real PDF generation deferred).
8. Creator analytics: `creator_profile.kyc_status` CHECK includes 'expired' (used by KYC rescreen freeze) not in domain KycStatus — fine for Wave 3.

## What Wave 2 shipped (Money-moving, WS-MKT-4)

### Migrations (0087–0089, ALTER/CREATE per P19 conventions)
- `0087_phase19_listing_versions` — `listing_version` (listing_id FK→marketplace_listing CASCADE, version_num, changelog text, manifest jsonb, created_by, created_at; UNIQUE(listing_id,version_num)). Workspace RLS.
- `0088_phase19_review_reply` — `marketplace_review` +reply/replied_by/replied_at (creator reply support); `payment_intent` +dispute_status CHECK(none,opened,won,lost,resolved), +refund_status CHECK(none,requested,approved,refunded), +refunded_at, +refund_reason.
- `0089_phase19_chargeback` — `marketplace_listing` +frozen_for CHECK(dispute,takedown), +frozen_at; `subscription` +canceled_at, +grace_ends_at, +revoked_at (7-day grace lifecycle).

### Contracts (append-only, old 16 operationIds untouched)
- `marketplace-service.yaml` → **21 operationIds** (+5, tag marketplace-checkout): `createPurchase`, `requestRefund`, `receiveStripeWebhook`, `receiveBkashWebhook`, `receiveNagadWebhook`; +4 schemas (PurchaseInput, PurchaseInitiation, RefundRequest, WebhookReceipt).
- Webhook catalog → **11 events** (+order.paid, +order.chargeback_opened).
- `marketplace-license-v1.schema.json` + `PurchaseLicenseGrant` definition.

### Services
- `services/marketplace` (`@domio/marketplace-service`) — **182 tests** (138 + 44 new), typecheck clean. New: `src/payments/{types,providers}.ts` (PaymentProvider interface + StripeSandboxProvider/BkashSandboxProvider/NagadSandboxProvider, verifyWebhook by provider signature header, sandbox env `MARKETPLACE_PAYMENTS_SANDBOX` default true), `src/license.ts` (LicenseSigner + SandboxLicenseSigner JWS-HS256 JWT-shaped token, 365-day exp, env `MARKETPLACE_LICENSE_SECRET`). Store +10 methods (payment_intent/license_grant/revenue_share_event/payout_ledger_entry/listing freeze + full pg DML vs 0081/0082/0087-0089). Service methods: `createPurchase` (idempotency via idempotency_key replay → no double-write, published-listing check, price calc, provider checkout), `handlePaymentWebhook` (verify sig → 401; success → paid + license_grant + revenue_share_event eligible + audit 'purchase'; re-delivery no-op; failed → no grant), `requestRefund` (14-day window + <5 inserts via injected UsageProvider default 0 → auto-approve else admin review; refund_status lifecycle; audit 'refund'), `handleChargeback` (FEATURE_MARKETPLACE_CHARGEBACK-gated: dispute → listing frozen_for='dispute' + audit; resolution → unfreeze). 6 handlers incl. the 5 contract operationIds + handleChargeback (200). Audit recorder now wired to money events (closes Wave-1 follow-up 6).

### Workers
- `workers/subscription-billing` (`@domio/subscription-billing-worker`) — **9 tests**. SubscriptionBillingWorker (setInterval tick, WORKER_TICK_MS 60000, start/stop/runOnce → {scanned,canceled,revoked}); injected SubscriptionProvider (InMemorySubscriptionProvider default): listDueForCancellation (cancel_at_period_end ≤ now), listGraceExpired (grace_ends_at ≤ now, not yet revoked); cancel → canceled_at, revoke → revoked_at after 7-day grace. Idempotent (skips already-canceled/revoked).
- `workers/refund-processor` (`@domio/refund-processor-worker`) — **8 tests**. RefundProcessorWorker (same tick pattern, runOnce → {scanned,auto_approved,review_required}); injected RefundProvider (InMemoryRefundProvider default): listRefundRequests('requested'), approveRefund (→ refund_status 'refunded'), flagForReview (admin queue). Auto-approve if within 14 days + usage <5 inserts, else admin.

## What Wave 3 shipped (Creator economy, WS-MKT-6/7)

### Migration `0090_phase19_creator_onboarding`
- `creator_profile` + `onboarding_state` CHECK(pending|profile_complete|kyc_required|kyc_submitted|kyc_approved|payout_ready|active) DEFAULT 'pending'.
- `kyc_rescreen_hit` (creator_id FK, kind pep|sanctions, matched_entity, decision freeze|review). Workspace RLS.
- `statement_record` (creator_id FK, period_month, kind monthly|yearly_1099k, total_gross/fee/net_cents, currency, payload jsonb). Workspace RLS.

### Contracts (append-only, 21 → **34 operationIds**)
- New tags marketplace-creator, marketplace-payout, marketplace-finance, marketplace-analytics. 13 new operationIds: getCreatorProfile, updateCreatorProfile, startKycSession, getKycStatus, createCreatorPayoutMethod, listCreatorPayoutMethods, getPayoutConnectLink, listPayoutRuns, getPayoutRun, getFxRate, getCreatorAnalytics, listCreatorStatements, getCreatorStatement. 10 new schemas (CreatorProfile, CreatorProfileUpdate, KycSessionStart, KycStatusResult, CreatorPayoutMethod, PayoutConnectLink, PayoutRun, FxRate, CreatorAnalytics, StatementSummary).
- Webhook catalog → **12 events** (+kyc.status_changed). Proto `marketplace_creator.proto` + `OnboardingState` enum (0-7).

### Services
- `services/marketplace` (`@domio/marketplace-service`) — **292 tests** (182 + 110 new). Creator module: onboarding state machine (transitions map + canSellPaidListings), KycProvider interface + SandboxKycProvider (deterministic poll sequence), PayoutConnectProvider + SandboxPayoutConnectProvider, startKycSession (emits kyc.status_changed) / getKycStatus / createPayoutMethod / listPayoutMethods / getPayoutConnectLink, 11 new store methods with full pg DML (creator_profile, creator_payout_method, kyc_session), 7 new handlers. Bug fixed during reconcile: kyc_session has no updated_at column in 0079 — removed from domain type + pg_store DML.
- `services/creator-analytics` (`@domio/creator-analytics-service`) — **72 tests**, NEW service. computeAnalyticsBody (downloads, installs, mrr_cents, conversion_rate, refund_rate, top 5 geos), buildStatementBody + buildYearly1099KBody, validatePeriod YYYY-MM, generateMonthlyStatement idempotent, generateYearly1099K. AnalyticsStore interface + InMemoryAnalyticsStore + PgAnalyticsStore full DML (revenue_share_event via seller_id, payment_intent join marketplace_listing for seller, license_grant via user_id). 4 handlers. Feature flag FEATURE_MARKETPLACE_ANALYTICS.

### Workers
- `workers/kyc-poller` (`@domio/kyc-poller-worker`) — **11 tests**. KycPollerWorker polls pending KYC sessions; SandboxKycClient deterministic (vendor_session_id -ok→approved, -no→rejected); runOnce → {polled, approved, rejected, still_pending, errored}; per-session error resilience.
- `workers/kyc-rescreen` (`@domio/kyc-rescreen-worker`) — **10 tests**. Nightly identity drift + sanctions; InMemoryRescreenProvider (name contains 'sanc'→sanctions/freeze, 'pep'→review); sanctions → freezeCreator + recordRescreenHit; PEP → flagForReview; idempotent (frozen excluded from listApprovedCreators).
- `workers/payout-executor` (`@domio/payout-executor-worker`) — **12 tests**. Monthly payout: group eligible revenue_share_events by creator, skip <$50 min / 30-day hold not met / no verified method, transfer with idempotency_key `${run_id}:${creator_id}`, ledger entries UNIQUE(executor_run_id,event_id) dedup, partial failure no batch rollback. runOnce({period_month}) → {run_id, creators_paid, total_payout_cents, skipped, failed}.
- `workers/fx-rate-cacher` (`@domio/fx-rate-cacher-worker`) — **9 tests**. Daily mid-rate for 6 USD/BDT/EUR pairs (cross-rates via USD); upsert to fx_rate UNIQUE(base,quote,fetched_at); idempotent same-day dedup.

## What Wave 4 shipped (Trust/curation/integrations, WS-MKT-5/8/9)

### Migration `0091_phase19_partner_webhooks`
- `partner_client` (workspace_id, name, client_id UNIQUE, client_secret_hash, scopes text[], tier CHECK(pro,enterprise) DEFAULT 'pro'). Workspace RLS.
- `webhook_delivery` (workspace_id, event_type, event_id, payload jsonb, signature, target_url, status CHECK(pending,sent,failed) DEFAULT 'pending', attempts, last_error, next_retry_at, delivered_at; UNIQUE(event_id,target_url) idempotent dedup). Workspace RLS.

### Contracts
- `marketplace-service.yaml` 34 → **42 operationIds** (+8: fileTakedown, listTakedownRequests, getTakedownRequest, resolveTakedownRequest, submitCounterNotice, createBrandLock, listBrandLocks, deleteBrandLock; schemas TakedownInput/TakedownRequest/ResolveTakedownInput/CounterNoticeInput/BrandLockInput/BrandLock/CuratedListingPage).
- NEW `contracts/openapi/v1/marketplace-partner.yaml` — **4 operationIds** (listPartnerListings, getPartnerListing, installPartnerListing, purchasePartnerListing), OAuth 2.1 scopes marketplace:read/install/purchase, rate limits 600/min pro / 6000/min enterprise, 429 Retry-After.

### Services (`@domio/marketplace-service` — **426 tests**, 18 files)
- **Curated (WS-MKT-5)**: brand_locked_listing filter — brandKitId query param, DENY overrides global visibility, `assertNotDenied` 403 guard on direct API bypass, override_price_cents applied for override state; `getCuratedMarketplaceListings` now real (was [] stub).
- **Takedown (WS-MKT-8)**: workflow received→in_review→confirmed|dismissed→counter_notice→resolved; fileTakedown/listTakedownRequests (status/kind filters)/getTakedownRequest/resolveTakedownRequest({decision})/submitCounterNotice; trust-scoring auto-hide below threshold (computeTrustScore/upsertTrustScore).
- **Audit wiring**: marketplace_audit_event (0085) recorded for brand_lock_curation (createBrandLock/updateBrandLock/deleteBrandLock) + takedown (fileTakedown/confirmTakedown/dismissTakedown/resolveTakedown).
- **Partner API (WS-MKT-9)**: PartnerClientService.verifyClient (sha256 client_secret_hash compare) + checkScope (InsufficientScopeError) + RATE_LIMIT_TIERS pro 600/min enterprise 6000/min; handlers getFxRate/listPayoutRuns/getPayoutRun gap-closed (GET /v1/fx/rates, /v1/payouts, /v1/payouts/{run_id}).
- **MCP**: src/mcp/{access,tools}.ts — 6 tools (get_listing, search_listings, install_listing, purchase_marketplace, get_reviews, get_creator_profile) gated by capability (marketplace:read/install/purchase); purchase_marketplace capability OFF by default → McpPermissionDeniedError (ERR_PERMISSION_DENIED); executeMcpTool dispatch.
- **Webhooks**: WebhookDispatcher — HMAC-SHA256 signing, createWebhookDelivery, retry with exponential backoff, token-bucket RateLimiter, idempotent UNIQUE(event_id,target_url).

### Follow-ups (updated Wave 4)
1. P06 `payout_executor_enabled` flag still doc-only — wire to gate payout-executor worker.
2. Verified-buyer review gate still in-memory license check (real license_grant lookup deferred).
3. Real vendor adapters (Stripe/bKash/Nagad/KYC/FX) — sandbox providers + narrow interfaces now, real providers later.
4. Migrations 0079–0091 not yet applied to a live DB — run `make migrate-up` before exercising services.
5. MCP tool names deviated from phase-doc list: delivered get_listing/search_listings/install_listing/purchase_marketplace/get_reviews/get_creator_profile; get_license_grant/request_refund/get_payout_status/file_takedown/lint_marketplace_listing NOT implemented (service methods exist — createPurchase/requestRefund/fileTakedown + listEligiblePayoutEvents; optional Wave 5).
6. Partner API: REST handlers + OAuth token issuance deferred to frontend lane (verifyClient/checkScope + rate-limit primitives exist).
7. webhook_delivery outbound sender is in-memory scaffold (createWebhookDelivery + retry bookkeeping) — real HTTP sender later.
8. KYC real Persona/Sumsub + kyc-webhook receiver later (SandboxKycClient deterministic now).
9. statement_record payload structured JSON (real PDF generation deferred).

## What Wave 5 shipped (Frontend + finalize, WS-MKT-1)

- **`apps/marketplace-web`** (`@domio/marketplace-web`) — storefront: home (hero, search, facet sidebar kind + price tier, curated/featured, listing grid with ৳ bn-first currency) + `/listing/[slug]` (preview, price + license, Buy/Install CTA → createPurchase, reviews listMarketplaceReviews, changelog getMarketplaceListingChangelog, related listings) + purchase state. SSR for LCP ≤2s. Dark theme: Space Grotesk (display) + DM Sans (body), canonical tokens (--bg #0a0e14, --accent #58a6ff), gold ratings, skeleton shimmer, staggered grid reveal, responsive 1→2→3 col. i18n via app-local lib/i18n.ts (editor useT pattern; bn full Bengali + ৳ + toBengaliDigits). `npx tsc --noEmit` clean + `next build` passes (/ 4.67 KB, /listing/[slug] 5.58 KB). Deviations: hand-rolled CSS (no MagicUI MCP needed), curated data fetched but not yet visually surfaced on home, slug = listing ID (API has no slugs).
- **`apps/creator-console`** (`@domio/creator-console`) — dashboard shell LIFTED from apps/dashboard (Sidebar/Header/KpiTile/Badge/SortableTable/Sparkline); pages `/listings` (table + create flow: kind selector, manifest, price model free|one_time|subscription|team_seats|enterprise_quote, license scopes, submit/publish), `/analytics` (getCreatorAnalytics KPI tiles + top geos), `/statements` (listCreatorStatements/generate), `/settings` (getCreatorProfile/update, KYC startKycSession/getKycStatus, payout methods + connect link). `npx tsc --noEmit` clean. Deviation: seller_id hardcoded 'current-user' (real auth context later).
- **`apps/admin-console`** (`@domio/admin-console`) — brand-locks page (listBrandLocks + getCuratedMarketplaceListings; createBrandLock allow|deny|override_price_cents; deleteBrandLock; CSV bulk-import client-side placeholder), takedowns queue (listTakedownRequests status/kind badges, detail drawer, resolveTakedownRequest confirmed|dismissed + notes, submitCounterNotice), trust scores, payout policy (getPayoutPolicy stat cards split 7000/3000 / min 5000 / hold 30 + listPayoutRuns), KPI overview. `npx tsc --noEmit` clean. KpiTile gained 'danger' tone; Badge tone mappers (brand-lock/takedown-status/kind/payout/listing); SortableTable format col accepts ReactElement.
- **Editor Insert→Marketplace panel** — `apps/editor/src/panels/marketplace-panel.tsx` {onInsert(catalogId, version?), brandKitId?}: injected fetchListings (default GET /v1/marketplace/curated?brand_kit_id=...), search + kind filters, grid reusing magic-card.tsx + marquee.tsx, Insert button, changelog/version, STALE-CACHE localStorage last-good + offline-cache note, BRAND-LOCKED OVERLAY (denied → locked badge + disabled Insert; override → override price + Insert allowed; handles allow|deny|override defensively). EditorRoot.tsx wired (import :77, tab type 'marketplace' :162, tab button :1296-1299 data-testid=tab-marketplace, panel branch :1523). Typecheck: 3 pre-existing @domio/audience-service errors, 0 new.
- **`packages/i18n`** (`@domio/i18n`) — 7 locales en|bn|es|fr|de|ja|zh-CN: locales.ts (SUPPORTED_LOCALES, DEFAULT_LOCALE en, isLocaleId), bengali-digits.ts (toBengaliDigits ASCII 0-9→০-৯), pluralization.ts (CLDR; bn one/other, ja/zh-CN other-only), format-currency.ts (formatCurrency(amountCents, BDT|USD|EUR, locale)), formatNumber/formatDate. 39/39 tests, tsc clean. tsconfig.base.json + @domio/i18n path aliases.

## Follow-ups (final)

1. Real vendor adapters (Stripe/bKash/Nagad/KYC/FX) — sandbox providers + narrow interfaces shipped; real providers later (P18 vendor-adapter pattern).
2. Partner API: REST handlers + OAuth 2.1 token issuance not yet wired to apps (verifyClient/checkScope/rate-limit primitives exist in services/marketplace).
3. MCP tools delivered: get_listing/search_listings/install_listing/purchase_marketplace/get_reviews/get_creator_profile; get_license_grant/request_refund/get_payout_status/file_takedown/lint_marketplace_listing optional (service methods exist).
4. webhook_delivery outbound sender is in-memory scaffold — real HTTP sender later.
5. Migrations 0079–0091 not yet applied to a live DB — run `make migrate-up` before exercising services.
6. Verified-buyer review gate still in-memory license check — real license_grant lookup later.
7. statement_record payload is structured JSON — real PDF generation later.
8. marketplace-web: curated surface + slug generation pending; creator-console seller_id real auth context pending.
9. `payout_executor_enabled` flag doc-only — wire to gate payout-executor worker.
