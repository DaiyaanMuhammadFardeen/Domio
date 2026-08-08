# Domio Marketplace Runbook (Phase 19)

Status: **Wave 1 complete (2026-08-09)** — Foundation + core domain. **Wave 2 complete (2026-08-09)** — Money-moving (checkout, refund, chargeback). Remaining: Waves 3, 4, 5.

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
1. P06 `payout_executor_enabled` flag is doc-only (never wired in code) — wire alongside Wave 3 payout machinery.
2. Verified-buyer review gate uses in-memory license check — real `license_grant` lookup in Wave 3 (post-checkout grants now exist in the store, just not queried by the review gate).
3. `getCuratedMarketplaceListings` returns `[]` stub — real brand-locked curated logic in Wave 4 (WS-MKT-5).
4. Real vendor adapters (Stripe/bKash/Nagad/KYC/FX) are external — sandbox providers + narrow interfaces now, real providers later (P18 vendor-adapter pattern).
5. Migrations 0079–0089 not yet applied to a live DB (no local Postgres in authoring environment) — run `make migrate-up` before exercising services.

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

## Waves remaining

- **Wave 3 — Creator economy (WS-MKT-6/7)**: onboarding/KYC state machine (pending→profile_complete→kyc_required→kyc_submitted→kyc_approved→payout_ready→active; free listings at profile_complete, paid requires payout_ready), KYC vendor-agnostic interface + kyc-webhook poll worker, payout setup (Stripe Connect Express OAuth / bKash-Nagad + bank fallback), `payout-executor` (monthly, groups by seller, idempotent on (executor_run_id,event_id), partial-failure no batch rollback, $50 min + 30-day hold), `fx-rate-cacher` (daily mid-rate) + VAT tax records, creator analytics (downloads/installs/MRR/conversion/refund rate/top geos) + PDF statements + 1099-K.
- **Wave 4 — Trust/curation/integrations (WS-MKT-5/8/9)**: brand-locked curated filter + 403 guard on direct API bypass, takedown intake/workflow/counter-notice + trust-scanner, partner API (OAuth 2.1 scopes, rate limits 600/min Pro / 6000/min Enterprise, `marketplace-partner.yaml`), MCP tools (`purchase_marketplace` capability OFF by default), webhook-dispatcher (HMAC idempotent), audit coverage.
- **Wave 5 — Frontend + finalize (WS-MKT-1 + cross-cutting)**: `apps/marketplace-web` storefront (SSR facets, LCP ≤2s, Lighthouse ≥90), editor Insert→Marketplace panel re-skin (brand-locked overlay), `apps/creator-console` studio (drag-upload, manifest, price, license) + analytics + statements, `apps/admin-console` brand-lock UI, i18n 7 locales (en, bn, es, fr, de, ja, zh-CN; bn first-class ৳ numerals), contracts tag `phase-19-contracts-v1.0.0`, runbook, full cross-service verify.
