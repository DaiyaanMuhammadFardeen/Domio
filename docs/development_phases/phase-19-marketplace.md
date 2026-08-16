## 📜 Planning-context banner

---

> ## ⚠️ Planning context — not a status report
>
> This is the original planning doc for this phase. The **live status of
> every phase** (what's actually shipped today on `master`) lives in
> **[`../../STATUS.md`](../../STATUS.md)**. Do not read this file as a
> status report — read it as the original spec that drove the work.
>
> See **[`../../CONSOLIDATED.md`](../../CONSOLIDATED.md)** for the full
> doc map.

---

# Phase 19 — Marketplace & Creator Economy

> **Phase:** 19 of 22
> **Name:** Marketplace & Creator Economy
> **Stream:** Cross-cutting — late Stream A touch (Ecosystem). Per `/docs/development_phases/README.md` and `phase-graph.md`, this phase pulls in P06 (components & templates), P07 (theming & brand), and P20 (security & enterprise); it also touches P17 (analytics) read-paths and P14 (sharing) embedded listing surfaces.
> **Critical path?** **No.** Runs late in Stream A in parallel with P17 and P22. Becomes a contended gate for P22 (GA) because P22 cannot declare "marketplace GA" until P19 ships.
> **Owner:** Stream A lead (marketplace service), P07 lead (theme marketplace surface), P20 lead (governance, KYC, residency), Fintech integration lead (Stripe Connect + bKash/Nagad), Frontend lead (storefront + creator console), MCP/agentic lead (marketplace tool surface)
> **Status:** Not started (phase doc only)

**Intent.** Turn the marketplace plumbing shipped in P06 into a production-grade, money-moving creator economy. Creators apply, complete KYC, list components/templates/themes/sticker/icon packs, set prices (free, one-time, subscription, team), and receive monthly payouts through Stripe Connect (and bKash/Nagad in Bangladesh per §11.5 of `/docs/pre-development-planning-guide.md`). Buyers browse, install, review, and get license grants; admins curate brand-locked listings for assigned workspaces (#41 multi-brand). This phase adds the **billing + payout execution** layer that P06 deferred, the **creator onboarding + KYC** gate, the **DMCA / takedown** workflow, **brand-locked marketplace** administrative curation, **marketplace analytics** for creators, and the **public marketplace API for partners** that runs alongside the editor's "Insert → Marketplace" surface.

---

## 1. Goals

1. **A creator can monetize.** A verified creator publishes a paid listing (one-time, team, or subscription), receives 70–85 % revenue share, accrues monthly eligibility ≥ $50, and is paid out via Stripe Connect (international) or bKash/Nagad (Bangladesh domestic) within their chosen payout window.
2. **A buyer can install a paid listing in one click.** Free, one-time, and subscription listings all flow through a single `POST /v1/marketplace/listings/{slug}/purchase` that returns a signed license JWT and a content-addressed install all in ≤ 1.5 s p95.
3. **Brand-locked marketplace curation.** A tenant admin can curate an org-private subset of the public marketplace ("approved for Brand A only") that overrides the editor's `Insert → Marketplace` panel for users in that brand-scope, while a license gate prevents cross-brand installation (#41 multi-brand).
4. **KYC + AML for paid creators.** Any creator reaching the "paid publish" tier completes identity verification (KYC) via the integrated provider before the first paid listing can be activated. BDT disbursements additionally require a Bangladeshi bank account or mobile wallet on file.
5. **DMCA / takedown workflow.** A takedown notice (copyright, trademark, or policy violation) is filed, triaged, and either confirmed (listing removed from storefront, installed instances flagged) or contested within SLA, with a complete audit trail suitable for legal review.
6. **Marketplace analytics for creators.** Every creator sees a dashboard with downloads, installs, revenue, conversion, refund rate, top geos, and license counts — all backed by the same `revenue_share_event` ledger P06 emitted, now going through payout execution.
7. **Public marketplace API for partners.** Third-party partners (PowerPoint add-ins, IDE plugins, partner storefronts) can list, search, install, and trigger purchases via a rate-limited, OAuth-scoped API consumer surface distinct from the MCP tool surface (which is agent-scoped).
8. **Tax, FX, and cross-border compliance.** Sales into Bangladesh compute VAT at the prevailing rate and remit; BDT/USD conversion happens at the invoice timestamp's mid-rate, with currency stored as integer cents per §5.7 of `/docs/pre-development-planning-guide.md`.

---

## 2. Scope

### 2.1 In scope (feature numbers)

|           # | Feature                                                                                                                                                                                                                                                     | Notes                                          |
| ----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
|  28 (parts) | Community marketplace — **billing + payout execution layer**. Listings, install, license grants, revenue share events arrived in P06; this phase adds the payout execution, refund window, chargeback handling, and the financial ledger close.             | Deferred surface from P06 §2.2.                |
|  41 (parts) | Multi-brand marketplace listing — **brand-locked admin-curated marketplace**. A tenant admin curates a subset of the public marketplace visible to a brand-scope (#41); brand-locked marketplace items are gated behind the licensing model created in P07. | Cross-cite with P07.                           |
|  45 (parts) | Theme marketplace — **storefront + billing surface for themes**. P07 owns the theme engine; P19 ships the public theme marketplace that reuses the same billing pipeline.                                                                                   | Cross-cite with P07.                           |
| 154 (parts) | **Marketplace analytics** — creator-facing dashboard reads from the analytics event bus.                                                                                                                                                                    | Cross-cite with P17.                           |
| 196 (parts) | **Audit log coverage** for marketplace reads, KYC checks, takedowns, refunds, payouts.                                                                                                                                                                      | Cross-cite with P20.                           |
| 200 (parts) | **Partner marketplace API** — `POST /v1/marketplace/listings` (from partner OAuth consumer), `GET /v1/marketplace/search`, `POST /v1/marketplace/listings/{id}/purchase`, `GET /v1/marketplace/listings/{id}/download`. Distinct from the MCP tool surface. | Read-write guarded by OAuth scopes (P20 §3.9). |
| 201 (parts) | **Marketplace webhooks** — `listing.published`, `order.created`, `order.refunded`, `payout.eligible`, `payout.paid`, `payout.held`, `takedown.filed`, `takedown.resolved`.                                                                                  | Co-signed with P06 §6.5.                       |
| 222 (parts) | **MCP marketplace tools** — `purchase_listing`, `request_refund`, `get_payout_status`, `file_takedown` extend P06's tool list.                                                                                                                              | Cross-cite with P13.                           |
| 225 (parts) | **Agent-scoped permissions** — MCP/agent purchasing is gated by a `purchase_marketplace` capability that is off by default and requires workspace-admin grant.                                                                                              | Cross-cite with P13/P20.                       |
| 227 (parts) | **Agent audit trail** — agent-initiated purchases and refund requests tag `actor_kind='agent'` in the audit log.                                                                                                                                            | Cross-cite with P13.                           |
| 237 (parts) | **Marketplace lint** — `lint_marketplace_listing` exposes a creator-side accessibility + license + provenance check before publish.                                                                                                                         | Cross-cite with P13.                           |

### 2.2 Out of scope (explicit non-goals)

- **Editorial marketplace content** (curated collections, "best of" lists, editorial review) — P22 hardening.
- **Direct carrier billing** (telco-billed payments) — P22.
- **Donations / tipping on listings** — explicitly **not** in this phase; defer to P22 if demand emerges.
- **NFT-minted listings** — never in scope; licenses are the contract.
- **Creator-to-creator secondary-market resale** of licenses — licenses are tied to the buyer and not transferable.
- **Multi-currency pricing** (per-listing currency selection by the creator) — listing price is set in one of `USD | BDT | EUR` at publish time; cross-currency conversion happens at the buyer's side at invoice time. Per-listing local pricing would be P22.
- **Reviewer incentives** (paid review programs) — conflicts with the "verified buyer" badge's trust model; defer.
- **Affiliate / referral system** — P22.
- **AI-generated marketplace listings** (auto-list of AI-created components) — those still require KYC'd creator; P12 / P22 territory.
- **Pacing #205–#219** — phase 21, novel & frontier.
- **Viewer-side license server hardening at scale** — the production scale-out of P06's `license-signer` worker is P22.

---

## 3. Dependencies

### 3.1 Upstream phases (must be complete)

- **P00** — repo, contracts, dev env. `contracts/proto/domio/v1/common.proto` `Idempotency-Key` header semantics reused on every mutating marketplace endpoint.
- **P01** — observability, CI/CD, infra baseline. OTel collector, Prometheus, object store, multi-region CDN, Vault/SecretsManager for Stripe & KYC provider keys.
- **P02** — deck schema and scene-graph foundation.
- **P05** — persistence, versioning, branches. `audit_*` tables reuse the P05 logging contract.
- **P06** — **critical dependency.** Component registry, `marketplace_listing`, `license_grant`, `revenue_share_event` (deferred payout), review/moderation pipeline, MCP component tools. P19 _activates_ `payout_executor_enabled = true`; P06 had it off.
- **P07** — theming & brand. `marketplace.theme` listing category, brand-kit binding, design-token licensing, brand-locked theme assets.
- **P13** — agentic & MCP. The marketplace MCP tool surface ships with P13's MCP server; P19 adds the financial tools.
- **P17** — analytics. Marketplace event streams plug into the analytics event bus P17 owns.
- **P20** — security & enterprise. SSO/SCIM for tenant admins, ABAC for brand-scope filtering, residency routing (marketplace CHO is per residency), the audit consumer that receives marketplace events, rate limits, webhooks reliability (§3.10).

### 3.2 Downstream phases this unblocks

- **P20 hardening** — the SOC 2 / GDPR audit pass references the marketplace audit trail now populated.
- **P22 — Polish, scale, GA** — the marketplace must be P22's "design partner demo" gate for the published-creator economy before GA.
- **P21** — novel & frontier features that touch the marketplace (e.g., AI gift bundles, knowledge-graph links to creator identities) can ride on identity + license surfaces from P19.

### 3.3 External (non-phase) dependencies

- **Stripe Connect** (or equivalent) — international creator payouts. Contracted via Stripe Express accounts.
- **bKash / Nagad** disbursement API — Bangladesh creators. §11.5 of `/docs/pre-development-planning-guide.md`.
- **KYC provider** — identity verification. Vendor TBD (Persona, Sumsub, Onfido, or local Bangladeshi KYC). PCI-DSS scope: this phase does not touch card data directly; Stripe handles tokenization.
- **SSLCommerz / ShurjoPay** — Bangladesh payment gateway aggregation (buyer-side) for buyers paying in BDT.

---

## 4. Workstreams

The phase is organized into eight workstreams. Tasks within each are ordered; the **DoD** at the end of every task is what the tech lead uses to mark the task done.

### 4.1 WS-MKT-1 — Marketplace storefront (buyer-side)

**Tasks (ordered):**

1. **Public storefront (`marketplace-web` web app + `marketplace-service` read API).**

   - Files: `apps/marketplace-web/src/{pages,components,search}/...`, `services/marketplace/src/{storefront,search,facets,recommendations}.ts`.
   - SSR-or-ISR web shell, server-rendered listing pages, lazy-loaded preview player.
   - Consumes: `GET /v1/marketplace/listings` (P06), extended with `?facet=...&geo=...&currency=...`.
   - Tests: Lighthouse score ≥ 90 on listing detail; LCP ≤ 2 s on 4G simulated; semantic HTML + axe-core AA pass.
   - **DoD:** A buyer can browse a category, facet-filter, sort, open a listing, and see a live preview with < 2 s LCP.

2. **Editor panel re-skin — "Insert → Marketplace".**

   - Files: `apps/canvas/src/panels/MarketplacePanel.tsx`, `apps/canvas/src/panels/marketplace/{Search,Filters,ListingCard,Preview}.tsx`.
   - Surfaces brand-locked overlay (WS-MKT-5 task 2) on top of the global marketplace, scoped to the active brand-kit.
   - Tests: in-editor search 400 ms p95 warm; facets update without page reload; preview modal thumbnails are keyboard-navigable.
   - **DoD:** the panel integrates with the canvas's theme tokens, renders server-curated listings ahead of public listings, and degrades gracefully when the marketplace service is unavailable (cached results + "may be stale" banner).

3. **Localization of storefront + panel.**
   - Files: `apps/marketplace-web/src/i18n/`, `packages/i18n/{locales}/marketplace.{en,bn,es,fr,de,ja,zh-CN}.json`.
   - §11.4 of `/docs/pre-development-planning-guide.md` and NFR-COM-13 — Bangla is a first-class locale at v1.
   - Tests: bn locale preview renders currency (`৳`), Bangla numerals where culturally expected, and bidirectionally-safe layout.
   - **DoD:** every part of the storefront reads from the i18n catalog; missing translations emit a non-fatal warning and render in `en`.

### 4.2 WS-MKT-2 — Listing creation flow (creator-side)

**Tasks:**

1. **Creator console (`apps/creator-console/src/...`).**

   - Files: `apps/creator-console/src/{listings,versions,pricing,assets,preview,submit,kyc,onboarding}/...`.
   - Studio UI: drag-upload listing assets, define `kind` (`component | template | theme | sticker_pack | icon_pack`), edit manifest, attach preview, set price, set license, declare dependencies, declare third-party licenses.
   - Tests: unit tests on `pricing` reducer (free / one-time / subscription / team), integration test on the submit → review → publish state machine.
   - **DoD:** a creator can draft a listing, attach a 5 MB preview MP4, declare `$19` one-time price + 5-seat team license, and submit for review.

2. **Validation pipeline (pre-publish).**

   - Files: `services/marketplace/src/listing/validate.ts`, `workers/listing-validator/`.
   - Runs: P06 license compatibility check, P13 `lint_marketplace_listing` (accessibility + license + provenance), P07 brand-kit inheritance check for themes, package-hash + signature verification (P06 §7.1).
   - Tests: synthetic listings with deliberately bad metadata fail with structured error codes; valid listings pass cleanly.
   - **DoD:** the validator returns a structured JSON report; the creator console shows each warning inline, with "blocked" vs "info" severities.

3. **Preview rendering (refresh of P06's `template-preview-renderer`).**

   - Files: `workers/preview-renderer/` (extends P06's worker), `services/marketplace/src/preview/queue.ts`.
   - Generates: 1 poster frame + 10-second WebM loop + 3 detail screenshots.
   - Tests: render ≤ 30 s p95 for a 12-slide template; cache invalidation on listing version bump.
   - **DoD:** every published listing has a poster and a loop; failed renders go to a retry queue with a manual trigger.

4. **Versioning + changelog.**
   - Files: `services/marketplace/src/listing/versions.ts`, `apps/creator-console/src/listings/Versions.tsx`.
   - Each new version bumps semver; the listing's `changelog` is rendered in the storefront "What's new" zoom.
   - Tests: force-bumping a major version triggers a "Breaking change — pinned users will be notified" banner creator-side.
   - **DoD:** a creator can publish `1.0.0` then `1.1.0`; the storefront shows the changelog; pinned instances (P06) keep working.

### 4.3 WS-MKT-3 — Reviews, ratings, and moderation

**Tasks:**

1. **Verified-buyer badge + review gating.**

   - Files: `services/marketplace/src/reviews/{submit,moderation}.ts`, `apps/marketplace-web/src/components/ReviewBadge.tsx`.
   - A review is accepted only if a `license_grant` exists for the reviewer→listing pair; rating is 1–5; the body is text + optional screenshots.
   - Tests: synthetic reviewers without grants receive 403; reviews with text > 4 KB rejected; admin override allows a non-buyer review (with a non-verified badge).
   - **DoD:** the storefront renders a verified-only badge; average rating is recomputed via materialized view refreshed on every approval.

2. **Moderation pipeline (extends P06's `review-moderator`).**

   - Files: `services/marketplace/src/moderation/{reviews,profanity,spam,image}.ts`.
   - Pipeline: profanity → spam heuristics → trust score → image classification (if screenshots attached) → sentiment. SLA: human review within 24 h for flagged reviews.
   - Tests: synthetic spam corpus blocked; verified-buyer reviews with profanity still go to human review, not auto-rejected.
   - **DoD:** ≥ 95 % of approved reviews are seen within 30 s; auto-flagged reviews render only after approval.

3. **Reply + report.**
   - Files: `apps/marketplace-web/src/components/ReviewReply.tsx`, `services/marketplace/src/reviews/reply.ts`.
   - Creators can reply once per review; users can report a review as abusive; reports feed the same moderation pipeline.
   - Tests: a creator reply updates the listing's "Replies" tab; a report pulls the review into the admin queue.
   - **DoD:** the storefront shows creator replies under the original review; admins see reported reviews in a dedicated queue.

### 4.4 WS-MKT-4 — Licensing, pricing, and subscription lifecycle

**Tasks:**

1. **Pricing model + license policy.**

   - Files: `services/marketplace/src/pricing/{model,policy,calculator}.ts`, `contracts/schema/marketplace-license-v1.schema.json`.
   - Listing types: `free`, `one_time`, `subscription`, `team_seats`, `enterprise_quote`.
   - License scopes: `single_seat`, `team_n_seats`, `enterprise_pool`.
   - Tests: every (type, scope) combination round-trips through the policy calculator; price in cents (integer, no floats) per §5.7.
   - **DoD:** a listing can be priced in `USD | BDT | EUR`; the calculator returns `{ gross_cents, fee_cents, net_cents, currency, fx_rate, fx_timestamp }`.

2. **Purchase flow.**

   - Files: `services/marketplace/src/checkout/{cart,checkout,webhook}.ts`, `workers/license-signer/` (extends P06).
   - Flow: `POST /v1/marketplace/listings/{slug}/purchase` → Stripe Checkout (or bKash/Nagad token-collection) → webhook `checkout.session.completed` → in-tx write of `license_grant` + `revenue_share_event`(payout_status='eligible') + signed JWT delivery.
   - Tests: idempotency on the same `Idempotency-Key`; webhook re-delivery does not double-write; failed payment leaves no `license_grant` row.
   - **DoD:** a Stripe test-mode purchase completes in < 1.5 s p95 with a license JWT delivered; a bKash sandbox purchase completes the same way.

3. **Subscription lifecycle.**

   - Files: `services/marketplace/src/subscription/{renewal,cancel,pause}.ts`, `workers/subscription-billing/`.
   - Daily cron scans Stripe subscription statuses; emits `payout.eligible` for each active month; cancelled subscriptions emit `license.revoked` after grace period.
   - Tests: a 30-day clock-advancing simulation advances billing, handles failed renewal, and only emits payout on success.
   - **DoD:** a subscription listing accrues monthly payouts; cancellation revokes the license after 7-day grace.

4. **Refund window + flows.**

   - Files: `services/marketplace/src/refund/{request,approve,deny}.ts`, `workers/refund-processor/`.
   - Rule (per P06 §2.1, feature 28): 14-day window, usage < 5 inserts; auto-approve if criteria met, else admin review.
   - Tests: usage counter increments on `install` events; refund decrements `revenue_share_event.net_cents` and marks `payout_status='refunded'`; the corresponding `payout_ledger_entry` row is created.
   - **DoD:** a buyer can request a refund; the creator's dashboard updates within 60 s; the audit log has the refund event.

5. **Chargeback handling.**
   - Files: `services/marketplace/src/chargeback/{detect,freeze,resolve}.ts`.
   - On Stripe dispute `charge.dispute.created`, the listing is set to `frozen_for=dispute`, the payout for that transaction is held, and the creator is notified.
   - Tests: synthetic dispute webhook moves the listing to frozen; resolution unfreezes and pays out / voids the held payout.
   - **DoD:** a chargeback freeze is visible in the creator console within 30 s; the listing does not accept new purchases while frozen.

### 4.5 WS-MKT-5 — Brand-locked marketplace (admin-curated)

**Tasks:**

1. **Brand-locked listing schema.**

   - Files: `services/marketplace/src/curated/listing.ts`, `migrations/2026_07_p19_curated.sql`.
   - Table: `brand_locked_listing` (mapping: `tenant_id, brand_kit_id, marketplace_listing_id, allow? boolean, override_price_cents?`).
   - Tests: a `DENY` mapping overrides the global marketplace visibility for the brand-scope.
   - **DoD:** a tenant admin can map `Brand A → only allow these 12 listings`; users in Brand A see only those 12.

2. **Editor-side filter.**

   - Files: `apps/canvas/src/panels/MarketplacePanel.tsx` (extends WS-MKT-1 task 2), `services/marketplace/src/curated/filter.ts`.
   - The panel's `Insert → Marketplace` calls a new endpoint `GET /v1/marketplace/curated?brand_kit_id=...` instead of the global listing.
   - Tests: a user with `Brand A` active sees only brand-locked listings; a user with `Brand B` (no curation) sees public listings.
   - **DoD:** the editor's marketplace panel respects brand-locked curation server-side; bypassing the panel via direct API call returns 403.

3. **Admin UI.**
   - Files: `apps/admin-console/src/marketplace/BrandLocked.tsx`, `packages/admin-ui/src/...`.
   - Admin can pin / unpin listings to a brand-kit, set override prices, and bulk-import curated sets via CSV.
   - Tests: bulk-import of 500 listings completes in < 10 s; per-brand pricing override is reflected in the storefront.
   - **DoD:** an admin can curate a brand-locked marketplace in < 5 minutes for a 50-listing subset.

### 4.6 WS-MKT-6 — Creator onboarding, KYC, and verification

**Tasks:**

1. **Creator onboarding state machine.**

   - Files: `services/marketplace/src/creator/{onboarding,profile}.ts`, `contracts/schema/creator-profile-v1.schema.json`.
   - States: `pending → profile_complete → kyc_required → kyc_submitted → kyc_approved → payout_ready → active`.
   - Tests: paid-publish blocked until `payout_ready`; free listings allowed at `profile_complete`.
   - **DoD:** a creator can publish free listings before KYC; paid listings require KYC + payout method.

2. **KYC integration.**

   - Files: `services/marketplace/src/kyc/{provider,session,callback}.ts`, `workers/kyc-webhook/`.
   - Vendor: Persona or Sumsub (TBD before kickoff). Vendor-agnostic interface: `start_session(creator_id) → session_url`, `poll_status(session_id) → { approved | rejected | pending }`.
   - Tests: synthetic webhook `approved` flips the creator to `kyc_approved`; periodic poll picks up long-tail vendor-callback failures.
   - **DoD:** a creator can complete KYC end-to-end in < 5 minutes; failed sessions fall through to a manual review queue.

3. **Payout setup.**

   - Files: `services/marketplace/src/payout/method/{stripe_connect,bkash,nagad,bank}.ts`.
   - International creators: Stripe Connect Express account onboarding via OAuth-style link; status poll sync.
   - Bangladesh creators: bKash/Nagad merchant-account collection + bank-account fallback.
   - Tests: Stripe sandbox onboarding completes; a missing-required-field blocks payout activation.
   - **DoD:** a creator can complete Stripe Connect onboarding in < 10 minutes; bKash-bound creators must additionally provide a verified NID.

4. **Identity drift + sanctions screening.**
   - Files: `services/marketplace/src/kyc/rescreen.ts`, `workers/kyc-rescreen/` (cron nightly).
   - Periodic re-screening against the KYC vendor's PEP/sanctions list; a hit freezes the creator and routes to admin.
   - Tests: a synthetic sanctions hit freezes payout; an admin override can unfreeze with an audit row.
   - **DoD:** nightly job runs in < 30 min for 100k creators; a hit surfaces in the admin queue within 60 s.

### 4.7 WS-MKT-7 — Payouts, revenue share, and creator analytics

**Tasks:**

1. **Payout executor (activates P06's deferred payout).**

   - Files: `services/marketplace/src/payout/executor.ts`, `workers/payout-executor/` (cron monthly), `payout_failure_recovery.ts`.
   - Reads `revenue_share_event` rows where `payout_status='eligible'` and `period_month = current_period`, groups by seller, applies creator-configured payout method, creates a `payout_ledger_entry` row, idempotently calls Stripe Transfer / bKash Disburse / Nagad Disburse.
   - Tests: idempotent on `payout_ledger(executor_run_id, event_id)`; partial failure (one seller fails, others succeed) does not roll back the batch.
   - **DoD:** a $1,234.56 monthly payout succeeds end-to-end in Stripe sandbox; the same $1,234.56 succeeds in bKash sandbox (BDT equivalent).

2. **Minimum threshold + hold periods.**

   - Files: `services/marketplace/src/payout/policy.ts`.
   - Default: $50 minimum payout threshold; 30-day hold on first-ever payout (per Stripe Connect norms); configurable per creator (Pro tier can lower).
   - Tests: a creator at $49.99 has `payout_status='below_threshold'`; a first-ever payout holds for 30 days, then releases.
   - **DoD:** creator dashboard shows accrual vs. eligible vs. paid.

3. **Currency conversion + tax.**

   - Files: `services/marketplace/src/finance/{fx,tax}.ts`, `workers/fx-rate-cacher/`.
   - FX mid-rate cached daily from a provider (e.g., openexchangerates.org); VAT computed per invoice for Bangladesh sales (current rate; verify against the prevailing Bangladesh VAT schedule at launch).
   - Tests: a USD-priced listing sold to a Bangladesh buyer records `gross_cents=1900`, `tax_cents=...`, `fx_rate=110.5`, `currency=BDT`.
   - **DoD:** every `revenue_share_event` row has `currency`, `gross_cents`, `tax_cents`, `fx_rate`, `fx_timestamp` populated; the creator dashboard reconciles.

4. **Creator analytics dashboard.**

   - Files: `apps/creator-console/src/analytics/{Overview,Revenue,Geo,Funnel}.tsx`, `services/marketplace/src/analytics/{query,rollup}.ts`.
   - Reads from the analytics event bus (P17) + `revenue_share_event` (P06) + `install` events.
   - Charts: downloads, installs, MRR, conversion, refund rate, top geos (with geo-IP), top templates within the listing. CSV export.
   - Tests: dashboard p95 load ≤ 1 s for 12 months of data; CSV export of 50k rows completes in < 10 s.
   - **DoD:** a creator can view the dashboard with all charts populated; export to CSV works in the dark mode.

5. **Statements + tax forms.**
   - Files: `services/marketplace/src/finance/statements.ts`, `workers/statement-generator/` (monthly).
   - Per-period PDF statement for each creator; year-end 1099-K equivalent (US) and equivalent forms for other jurisdictions as required.
   - Tests: a generated statement matches the sum of `revenue_share_event.net_cents` for the period.
   - **DoD:** a creator can download a PDF statement for the previous month; year-end tax form is generated by Jan 31.

### 4.8 WS-MKT-8 — Takedowns, DMCA, and trust & safety

**Tasks:**

1. **Takedown intake.**

   - Files: `services/marketplace/src/takedown/{intake,form}.ts`, `apps/marketplace-web/src/legal/takedown.tsx`.
   - Public form for copyright (DMCA), trademark, and policy complaints; requires identity + good-faith statement (DMCA §512(c) elements).
   - Tests: a takedown filing creates a `takedown_request` row with structured fields; the filing user receives a confirmation email with a reference id.
   - **DoD:** the form is reachable from every listing's footer; a submission creates a trackable case.

2. **Takedown workflow.**

   - Files: `services/marketplace/src/takedown/{triage,resolve,appeal}.ts`, `workers/takedown-router/`.
   - States: `received → in_review → confirmed | dismissed → counter_notice_window → resolved`.
   - On `confirmed`: listing is removed from storefront, installed instances show "Removed — please replace" badge, the creator is notified, payouts for that listing are held.
   - On `dismissed`: creator is notified; no further action.
   - Tests: a confirmed takedown propagates the badge to all installed decks within 5 min; the creator can submit a counter-notice.
   - **DoD:** confirmed takedowns are visible in the marketplace audit log with full provenance; counter-notice flow is documented.

3. **Trust & safety scanning.**
   - Files: `services/marketplace/src/trust/{scan,score}.ts`, `workers/trust-scanner/` (continuous).
   - Scans: malware in package bundles (P06 §7.1 reused), phishing-like preview URLs, suspicious pricing patterns (e.g., $0.99 → $99.99 toggle), abusive bundles.
   - Tests: a synthetic bundle with a malicious script feature is auto-quarantined with an audit row.
   - **DoD:** a listing with a trust score below threshold is auto-hidden pending review.

### 4.9 WS-MKT-9 — Partner marketplace API, MCP, and audit

**Tasks:**

1. **Partner API (consumer-facing).**

   - Files: `services/marketplace/src/api/partner/{listings,search,download,purchase}.ts`, `contracts/openapi/v1/marketplace-partner.yaml`.
   - OAuth 2.1 consumer credentials (P20 §3.9); scopes `marketplace:read`, `marketplace:install`, `marketplace:purchase`.
   - Rate limits: 600 req/min (Pro), 6 000 req/min (Enterprise), per consumer.
   - Tests: scoped consumer cannot call purchase with `marketplace:read` only; rate-limit returns 429 with `Retry-After`.
   - **DoD:** a partner CLI (`deckctl marketplace install <slug>`) round-trips through the consumer API.

2. **MCP marketplace tools (agent-facing).**

   - Files: `packages/mcp-tools/src/marketplace.ts`, `services/marketplace/src/mcp/{handlers,tools}.ts`.
   - Tools: `purchase_listing`, `get_license_grant`, `request_refund`, `get_payout_status`, `file_takedown`, `lint_marketplace_listing`.
   - `purchase_listing` requires `purchase_marketplace` capability; default OFF.
   - Tests: an agent token without the capability gets `ERR_PERMISSION_DENIED`; the audit log records `actor_kind='agent'`.
   - **DoD:** an MCP test agent can purchase a test listing in CI with a sealed workspace.

3. **Audit log coverage.**

   - Files: `services/marketplace/src/audit/{emit,events}.ts`, `apps/audit-consumer/src/marketplace.ts` (P20 consumer).
   - Events: every purchase, refund, payout, takedown, KYC decision, license revoke, brand-lock curation change, MCP purchase.
   - Tests: every event has `actor_id`, `tenant_id`, `trace_id`, `prev_hash`; hash chain verifies via `deckctl audit verify`.
   - **DoD:** SOC 2-relevant event types are present in the audit log under their canonical names.

4. **Webhooks (seller-facing + partner-facing).**
   - Files: `services/marketplace/src/webhooks/{dispatch,subscribe}.ts`, `workers/webhook-dispatcher/`.
   - Events: `listing.published`, `listing.updated`, `order.created`, `order.refunded`, `payout.eligible`, `payout.paid`, `payout.held`, `takedown.filed`, `takedown.resolved`.
   - HMAC signing per P20 §3.10; at-least-once delivery with idempotency keys.
   - Tests: a webhook receiver gets the event with the correct signature; replay with the same idempotency key returns 200 without re-delivery.
   - **DoD:** a partner can subscribe to all events in a sandbox and verify delivery.

---

## 5. Architecture & Data

### 5.1 Service / module layout

```text
+------------------------------------------------------------------+
|  apps/marketplace-web   apps/creator-console   apps/admin-console|
|  (public storefront)    (creator studio)       (tenant admin)   |
+----------------------------+--+-------------+---------------------+
                             |  |             |
                             v  v             v
+------------------------------------------------------------------+
|  marketplace-service (Ru/Node modular monolith)                  |
|  Modules: storefront, search, listings, checkout, license,        |
|           subscription, refund, chargeback, takedown, trust,      |
|           creator, kyc, payout, fx, tax, statements, curated,     |
|           mcp, partner_api, webhooks, audit                      |
+----------------+-----------------------------+-------------------+
                 |                             |
                 v                             v
+-----------------------+      +-----------------------------------+
|  Postgres             |      |  Object store + CDN (P01)         |
|  (marketplace_*,      |      |  - s3://domio-marketplace-assets/ |
|   creator_*, kyc_*,   |      |  - s3://domio-creator-uploads/    |
|   payout_*,           |      |  - previews/, statements/         |
|   takedown_*,         |      +-----------------------------------+
|   brand_locked_*,     |
|   audit_, license_*,  |      +----------------------+
|   revenue_share_*)    | <--> |  Stripe Connect      |
+-----------------------+      |  bKash / Nagad       |
                                |  KYC vendor          |
                                |  FX / VAT provider   |
                                +----------------------+
                                          ^
                                          |
              +----------------------+    |    +-----------------------+
              |  workers/            |----+    |  workers/              |
              |  payout-executor     |         |  kyc-webhook           |
              |  fx-rate-cacher      |         |  trust-scanner         |
              |  takedown-router     |         |  statement-generator   |
              |  refund-processor    |         |  subscription-billing  |
              |  webhook-dispatcher  |         |  preview-renderer (P06)|
              |  kyc-rescreen (cron) |         |  payout-executor (cron)|
              +----------------------+         +-----------------------+
```

The marketplace service is a separate module (still part of the modular monolith at v1) exposing purchase, license, payout, takedown, KYC, and curated endpoints. The four external integrations (Stripe Connect, bKash/Nagad, KYC vendor, FX provider) are wrapped in narrow interfaces so the executor can be swapped per region.

### 5.2 New tables (additions to P06's marketplace\_\* set)

All tables use `id uuid primary key default gen_random_uuid()` and `created_at/updated_at timestamptz default now()` unless otherwise noted. Cents are integer (`bigint`); currency is `char(3)` ISO 4217.

- `creator_profile` (`id`, `user_id`, `display_name`, `slug`, `bio`, `country_code`, `payout_method`, `payout_ready bool`, `kyc_status`, `balance_cents`, `currency`).
- `creator_payout_method` (`id`, `creator_id`, `kind` (`stripe_connect | bkash | nagad | bank`), `external_account_id`, `verified bool`, `metadata jsonb`).
- `kyc_session` (`id`, `creator_id`, `vendor`, `vendor_session_id`, `status`, `last_polled_at`, `raw jsonb`).
- `brand_locked_listing` (`tenant_id`, `brand_kit_id`, `marketplace_listing_id`, `state` (`allow | deny | override`), `override_price_cents`, `notes`, `audit_actor_id`).
- `payment_intent` (`id`, `buyer_id`, `listing_id`, `purchase_id`, `provider`, `provider_intent_id`, `currency`, `gross_cents`, `tax_cents`, `fee_cents`, `net_cents`, `fx_rate`, `fx_timestamp`, `status`, `idempotency_key` unique).
- `subscription` (`id`, `listing_id`, `buyer_id`, `provider_subscription_id`, `status`, `current_period_end`, `cancel_at_period_end bool`).
- `payout_ledger_entry` (`id`, `creator_id`, `period_month`, `event_id` ref `revenue_share_event.id`, `gross_cents`, `fee_cents`, `net_cents`, `currency`, `status` (`pending | paid | held | failed | refunded`), `provider`, `provider_transfer_id`, `executor_run_id`, `idempotency_key` unique on (`executor_run_id`, `event_id`)).
- `payout_run` (`id`, `period_month`, `executed_at`, `total_creators`, `total_payout_cents`, `currency`, `status`).
- `fx_rate` (`base`, `quote`, `rate`, `fetched_at`, `source`).
- `tax_record` (`id`, `payment_intent_id`, `country_code`, `tax_type`, `rate`, `tax_cents`, `currency`, `computed_at`).
- `takedown_request` (`id`, `listing_id`, `claimant_id`, `kind` (`dmca | trademark | policy`), `evidence_url`, `statement`, `status`, `resolution_notes`, `submitted_at`, `resolved_at`).
- `trust_score` (`listing_id`, `score`, `signals jsonb`, `computed_at`).
- `marketplace_audit_event` (extends P06 / P20 audit; same hash-chained append-only shape; `event_kind` enum includes `purchase`, `refund`, `payout`, `takedown`, `kyc`, `brand_lock_curation`, `agent_purchase`).

### 5.3 New migrations

`migrations/2026_07_p19_marketplace_billing.sql` (and per-step files thereafter):

1. `001_create_creator.sql` — `creator_profile`, `creator_payout_method`, `kyc_session`.
2. `002_create_brand_locked.sql` — `brand_locked_listing`, indexes on `(tenant_id, brand_kit_id)`.
3. `003_create_payments.sql` — `payment_intent`, `subscription`, indexes on `(buyer_id, listing_id)`.
4. `004_create_payout.sql` — `payout_ledger_entry`, `payout_run`, indexes on `(creator_id, period_month)`.
5. `005_create_finance.sql` — `fx_rate`, `tax_record`, `fx_rate(base, quote, fetched_at)` unique.
6. `006_create_takedown.sql` — `takedown_request`, `trust_score`.
7. `007_extend_audit.sql` — `marketplace_audit_event` extending P20 audit.
8. `008_seed_payout_policy.sql` — default 70/30 split, $50 minimum, 30-day first-payout hold.

### 5.4 Contracts added (versioned under `/contracts`)

- `contracts/proto/domio/v1/marketplace_billing.proto` — `purchase_listing`, `request_refund`, `subscription_*`, `payout_*`.
- `contracts/proto/domio/v1/creator.proto` — onboarding, KYC, payout method.
- `contracts/proto/domio/v1/curated.proto` — brand-locked listing curation.
- `contracts/proto/domio/v1/takedown.proto` — takedown request, resolve, counter-notice.
- `contracts/proto/domio/v1/mcp_marketplace.proto` — `purchase_listing`, `request_refund`, `get_payout_status`, `file_takedown`, `lint_marketplace_listing`.
- `contracts/openapi/v1/marketplace-partner.yaml` — partner OAuth consumer API.
- `contracts/schema/marketplace-license-v1.schema.json` — license policy (`free | one_time | subscription | team_seats | enterprise_quote`).
- `contracts/schema/marketplace-payout-v1.schema.json` — payout policy (split, threshold, hold).
- `contracts/schema/creator-profile-v1.schema.json`.
- `contracts/webhooks/marketplace-v1.events.json` — webhook event catalog.

### 5.5 Cross-references to master docs

- **/docs/04-system-architecture.md** — modular monolith guidance; marketplace-service's place alongside `registry-service`, `data-gateway`, `export-pipeline`, `presence-service`, `mcp-server`. The webhook dispatcher is a core cross-cutting service.
- **/docs/05-data-database-design.md** — JSONB conventions, audit table conventions (P20 §3.5), content-hash + semver unique constraints, integer-cents for currency (§5.7 of planning guide), residency-tagged buckets for marketplace-purchaser data.
- **/docs/06-technology-stack.md** — Postgres + S3-compatible object store, OpenSearch for marketplace search, Redis read-through cache, Stripe SDK, bKash/Nagad SDKs, KYC vendor SDK.
- **/docs/07-security-planning.md** — secrets manager for API keys; HMAC signing (P20 §3.10); CSRF on webhooks; rate limiting (P20 §3.9).
- **/docs/11-legal-compliance-bangladesh.md** — PDPA 2026 + data localization; FX rate + VAT computation; bKash/Nagad disbursement; KYC obligations.
- **/docs/components-templates.md** — P06's `marketplace_listing`, `license_grant`, `revenue_share_event`, license JWT verification, brand-lock model.
- **/docs/enterprise-governance.md** — P20 RBAC + ABAC, residency, audit, webhooks, rate limits, plugin sandboxing, OAuth consumer scopes.

---

## 6. Verification matrix

|                 Feature | Test                                                                                                                          | Expected result                                                                                                                                                                       | Owner                  |
| ----------------------: | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
|      28 (paid purchase) | A creator publishes a $19 `one_time` listing; a buyer in USD purchases via Stripe; a buyer in BDT purchases via bKash sandbox | Both purchases complete in < 1.5 s p95; license JWT issued; `revenue_share_event` row written with integer `gross_cents`, `tax_cents`, `fx_rate`, `currency`; creator balance updates | Marketplace lead       |
|       28 (subscription) | A creator publishes a $9.99/mo subscription; buyer subscribes; clock advances 30 days                                         | Subscription renews; `payout.eligible` event emitted; second renewal works; cancellation revokes after 7-day grace                                                                    | Marketplace lead       |
|             28 (refund) | A buyer requests a refund within 14 days, usage < 5 inserts                                                                   | Refund auto-approved; `revenue_share_event.net_cents` decremented; `payout_ledger_entry.status='refunded'`; creator dashboard updates within 60 s                                     | Marketplace lead       |
|         28 (chargeback) | A buyer disputes a charge via Stripe sandbox                                                                                  | Listing freezes; payout for that transaction is held; creator notified; resolution restores or voids the hold                                                                         | Marketplace lead       |
|     28 (creator payout) | A creator reaches $50 eligible; monthly executor runs                                                                         | Stripe transfer (USD) + bKash disburse (BDT) both succeed; `payout_ledger_entry.status='paid'`; `payout_run` row written; idempotent on re-run                                        | Fintech lead           |
|           28 (KYC gate) | A new creator tries to publish a paid listing without KYC                                                                     | Blocked with structured error; once KYC is approved, paid listing is allowed                                                                                                          | Marketplace lead       |
|       41 (brand-locked) | Tenant admin sets `Brand A → only allow these 12 listings`; a user in Brand A opens `Insert → Marketplace`                    | Only the 12 curated listings appear; direct API calls to `GET /v1/marketplace/listings` are filtered server-side; brand B users see the public marketplace                            | P07 + Marketplace lead |
|  45 (theme marketplace) | A creator publishes a theme from P07's theme engine; a buyer installs it                                                      | The storefront shows the theme with a live preview; install creates a `theme_install` row + `license_grant`; DRM is preserved                                                         | P07 lead               |
| 154 (creator analytics) | A creator opens the analytics dashboard for the last 90 days                                                                  | Downloads, installs, revenue, MRR, conversion, refund rate, top geos all populated; p95 load ≤ 1 s; CSV export works                                                                  | Analytics lead         |
|             196 (audit) | SOC 2 reviewer pulls audit events for a workspace                                                                             | Every purchase, refund, payout, takedown, KYC decision, license revoke, brand-lock curation change has a chain-verified row                                                           | P20 lead               |
|       200 (partner API) | Partner CLI runs `deckctl marketplace install <slug>` with a Pro-tier consumer credential                                     | Listing installs through the partner API; rate-limit respected; scoped consumer cannot purchase without `marketplace:purchase`                                                        | MCP/agentic lead       |
|          201 (webhooks) | A partner subscribes to `order.created`, `payout.paid`, `takedown.filed`; trigger events fire                                 | Events delivered within P20 §3.10 budgets; signatures verify; replay is idempotent                                                                                                    | Platform lead          |
|      222 (MCP purchase) | MCP test agent calls `purchase_listing` with a default token                                                                  | Returns `ERR_PERMISSION_DENIED`; with `purchase_marketplace` capability granted, the purchase succeeds; audit row has `actor_kind='agent'`                                            | MCP/agentic lead       |
|       225 (agent scope) | Agent token lacks `takedown:file`; agent calls `file_takedown`                                                                | Rejected with structured error; ABAC policy honored                                                                                                                                   | P20 lead               |
|       227 (agent audit) | An MCP agent completes a purchase + a refund                                                                                  | Both events in the audit log tagged `actor_kind='agent'`, agent identifier, workspace                                                                                                 | MCP/agentic lead       |
|              237 (lint) | A creator runs `lint_marketplace_listing` on a draft listing                                                                  | Returns structured report with accessibility, license, and provenance warnings; blocked vs. info severities                                                                           | Marketplace lead       |
|                  (DMCA) | A copyright holder files a takedown for a paid listing                                                                        | Takedown case created; listing removed from storefront within SLA; installed instances show "Removed — please replace"; creator can submit a counter-notice                           | Trust & safety lead    |
|             (Sanctions) | Nightly rescreen flags a creator                                                                                              | Creator payouts freeze; admin queue shows the case; admin override can unfreeze with audit row                                                                                        | Marketplace lead       |
|        (Refund dispute) | A buyer is over the 14-day window                                                                                             | Refund denied; a `marketplace_audit_event` of kind `refund_denied` is written; appeal to support is documented                                                                        | Marketplace lead       |
|          (Cross-border) | A USD-priced listing is sold to a Bangladesh buyer                                                                            | VAT computed per prevailing rate; FX rate at invoice timestamp; integer cents stored; audit trail present                                                                             | Fintech lead           |
|             (Residency) | A residency-pinned purchase is routed to the correct zone                                                                     | Audit log has `residency_zone` on the payment intent; cross-zone assertions pass                                                                                                      | P20 lead               |

---

## 7. Risks & open decisions

- **Stripe Connect + bKash parallax.** International vs. domestic disbursement have different cutoff times, FX windows, and failure modes. **Mitigation:** the executor treats each method as a separate provider; per-method retry policy; per-method failure recovery.
- **Payout failure recovery.** A bank rejects a transfer (e.g., closed account). **Mitigation:** the executor marks `status='failed'` and re-routes to the creator's `payout_method.backup`; an admin can manually re-route.
- **VAT rate drift in Bangladesh.** The VAT rate is not yet locked for the foreseeable horizon. **Mitigation:** cache rate per `tax_record` row at invoice time; periodic fetcher from a primary source; admin override.
- **KYC vendor lock-in.** Switching vendors later is painful. **Mitigation:** vendor-agnostic interface; `kyc_session.vendor` enum allows multiple vendors in parallel.
- **Refund fraud.** A buyer purchases → installs everywhere → refunds within 14 days → re-purchases. **Mitigation:** the 5-insert usage threshold (P06 §2.1) caps the abuse; repeated patterns flagged in the trust score.
- **Takedown abuse.** A bad-faith claimant files a takedown to disable a competitor. **Mitigation:** counter-notice path; review by a marketplace trust & safety team; audit row for every action.
- **Brand-locked marketplace scaling.** A globally popular listing is curated to one brand, hiding it from the rest of the world. **Mitigation:** the global storefront denies brand-locked listings from the public view automatically; install via direct slug remains admin-only.
- **FX rate lag.** A buyer pays during a currency spike; the next-day FX rate causes a payout discrepancy. **Mitigation:** the FX rate is locked at the invoice timestamp; the `payout_ledger_entry` carries the same `fx_rate` regardless of the executor's later date.
- **MCP agent purchasing safety.** A misconfigured agent token wants to make purchases. **Mitigation:** `purchase_marketplace` is off by default; requires workspace-admin grant; per-workspace monthly cap; per-listing price cap; dry-run mode (P13 §6.7) returns a diff without committing.
- **Bundle size + license compatibility as a marketplace gate.** A listing references a font another creator's listing has exclusive rights to. **Mitigation:** the validator cross-references bundled assets against the workspace's licensed asset set; conflicts block publish.
- **Appeal of removals.** Creators may appeal brand-locked removals / takedowns. **Mitigation:** a queued, audit-logged appeal workflow in the admin console; SLA 7 business days.
- **Cross-border tax nexus.** A creator selling from the US to Bangladesh may trigger Bangladesh-related obligations. **Mitigation:** tax record is best-effort for v1; documented in the legal terms; verified by counsel before launch per §11.6 of the planning guide.
- **Open decision: per-region storefront UI.** Will the storefront be one global site with locale-aware currency, or separate per-region sites? **Mitigation:** one global site with locale-aware currency (BDT/USD toggle) at v1; split based on telemetry.

---

## 8. Demo

A working demo that proves the phase is done in the internal environment.

**Setup:**

1. A tenant seeded with: workspace-admin, two designers, one verifier (KYC admin), one trust & safety lead; `theme.platform.fallback` loaded; a brand-kit `Brand A` and `Brand B` configured.
2. The Stripe sandbox account is connected; a bKash sandbox merchant account is bound; a Persona test vendor is configured.
3. A pre-existing creator account `creator-a` (paid-tier, KYC-approved, Stripe Connect onboarded) and `creator-b` (free-tier, no KYC).
4. A pre-published free stat-card listing (P06) and a new $19 paid listing are available.

**Script (all times budgeted; total ~ 9 min):**

1. **Creator onboarding + KYC (2 min).** A new creator signs up, completes profile, runs KYC via the integrated provider, connects Stripe Connect, lands on `payout_ready`. Console shows the `kyc_approved` event in the activity feed.
2. **Publish a paid listing (1 min).** `creator-a` uploads a 12-slide template, sets `$19` one-time, 5-seat team license, validates (`lint_marketplace_listing` returns 0 blockers), previews, publishes. Listing transitions `draft → in_review → published` within 30 s.
3. **Buyer-side purchase — USD (1 min).** A buyer in the US opens `Insert → Marketplace`, finds the listing, clicks "Add to library." Stripe Checkout completes; bundle installs; license JWT arrives; the listing is now in the buyer's library.
4. **Buyer-side purchase — BDT (2 min).** A buyer in Bangladesh opens the storefront, switches to BDT, sees `৳ 2,099` (FX-locked at invoice timestamp), checks out via bKash sandbox. Same install + license flow.
5. **Review + verified-buyer badge (45 s).** The buyer submits a 5-star review with a screenshot. The review auto-approves via the moderation pipeline; the verified-buyer badge is visible.
6. **Refund window (45 s).** The buyer requests a refund (usage < 5 inserts). Auto-approved. Creator's dashboard updates within 60 s; the buyer's library shows the listing as "Refunded — please replace or re-purchase."
7. **Chargeback (45 s).** A separate buyer disputes a charge via Stripe sandbox. The listing freezes; the creator sees the held payout; the trust & safety lead resolves the dispute; the creator's payout restores.
8. **Payout executor (1 min).** Cron ticks the monthly executor; `creator-a` reaches $50 eligibility; the executor pays out via Stripe Connect. The creator dashboard shows `payout.paid`; the audit log has the chain-verified row.
9. **MCP agent purchase (1 min).** An MCP test agent with `purchase_marketplace` capability installs a different listing through the marketplace MCP tool. Audit log shows `actor_kind='agent'`. A second agent without the capability is rejected with `ERR_PERMISSION_DENIED`.
10. **Brand-locked marketplace (1 min).** Workspace admin sets `Brand A → only listings [stat-card, kpi-card, theme-aurora]`. A designer in Brand A opens `Insert → Marketplace`; only the 3 listings appear. A designer in Brand B sees the global marketplace.
11. **DMCA / takedown (1 min).** A copyright holder files a takedown on a sticker pack. The listing is removed from the storefront; installed instances show "Removed — please replace"; the creator receives the takedown email and can submit a counter-notice within the workflow.
12. **Partner API (1 min).** A partner CLI runs `deckctl marketplace install kpi-card-pro` with a Pro-tier consumer credential. The install succeeds through the consumer API; the audit log shows the consumer identity.

**Pass criteria:**

- Every step completes in the time budget.
- Telemetry: `marketplace_purchase_duration_seconds{provider,currency}` histogram p95 < 1.5 s; `payout_executor_duration_seconds` p95 < 60 s; `takedown_resolution_duration_seconds` p95 < SLA; `marketplace_search_latency_seconds` (P06) p95 < 400 ms warm.
- Audit log: every purchase, refund, payout, takedown, KYC decision, license revoke, brand-lock curation change has a row with `prev_hash`.
- Hash chain verifies via `deckctl audit verify`.
- KYC gate: a creator without KYC cannot publish a paid listing (verified by attempting to publish and seeing the structured error).
- Brand-locked marketplace: bypassing the panel via direct API call returns 403 (verified by curl).

---

## 9. Definition of Done

- [ ] All §4 workstream tasks merged to `main` with green CI (unit, integration, contract, lint, type-check).
- [ ] All §5 schemas and Proto contracts versioned under `/contracts`, each with a CHANGELOG entry; OpenAPI specs regenerated and checked in.
- [ ] All migrations under `migrations/2026_07_p19_*.sql` applied to staging; roll-forward + roll-back tested.
- [ ] Unit test coverage ≥ 80 % line on `services/marketplace` (`checkout`, `payout`, `kyc`, `curated`, `takedown`, `trust` modules); property tests on the refund calculator and FX converter.
- [ ] Integration tests pass: Stripe + bKash sandbox purchase round-trip; KYC callback idempotent on retry; payout executor idempotent on `executor_run_id`.
- [ ] End-to-end Playwright suite passes: the full demo script.
- [ ] Performance budgets verified in CI nightly run: purchase < 1.5 s p95; payout executor < 60 s p95; takedown removal < 5 min p95; brand-locked filter < 200 ms p95.
- [ ] Security tests pass: idempotency-key replay does not double-write; webhook signature verification rejects forged events; HMAC rotation upheld; rate-limit returns 429 with `Retry-After`; ABAC denies cross-brand install attempt.
- [ ] Telemetry: histograms + counters em to the OTel collector in staging; alerts wired in Grafana (`marketplace_purchase_error_rate`, `payout_executor_failure_rate`, `takedown_resolution_duration_seconds`, `kyc_session_timeout_total`, `fx_rate_age_seconds`).
- [ ] MCP tools implemented and documented; an MCP test agent exercises the full purchase / refund / takedown surface in CI.
- [ ] Audit log coverage: every marketplace event from §6 verification matrix has a chain-verified row; `deckctl audit verify` succeeds.
- [ ] Cross-section ties verified: P06's `payout_executor_enabled` is now `true`; P07's theme marketplace reuses the billing pipeline; P13's MCP tools consume the marketplace MCP handlers; P17's analytics dashboard consumes the dashboard queries; P20's audit consumer + residency routing are wired.
- [ ] Localization: marketplace storefront + creator console available in en + bn + es + fr + de + ja + zh-CN (NFR-COM-13).
- [ ] Accessibility: axe-core run on the storefront, creator console, and `Insert → Marketplace` panel returns zero AA violations.
- [ ] Legal review: counsel has reviewed VAT computation, FX policy, KYC obligations, takedown workflow, and ToS/Privacy updates per §11.6 of `/docs/pre-development-planning-guide.md`.
- [ ] Documentation: this phase doc reviewed; ADRs for "Why Stripe Connect + bKash over a single global provider" and "Why brand-locked marketplace as a curated subset" checked into `/docs/adr/`.
- [ ] Demo passed in internal environment per §8.

_Phase 19 closes when the DoD checklist is fully checked. P22 (Polish, scale, GA) becomes unblocked at that point for the marketplace, and P20's SOC 2 / GDPR audit pass can reference the live marketplace audit trail._
