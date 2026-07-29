# Phase 20 — Security, Governance & Enterprise (CROSS-CUTTING, continuous)

**Phase:** 20
**Name:** Security, governance, enterprise
**Owner(s):** Security lead (overall); Identity/SSO squad (identity-svc); Governance/DLP squad (gov-svc, dlp-svc); Platform/API squad (api-gw, webhook-svc, plugin-rt); Privacy/DPO (residency, retention, audit); Headless render squad (render-svc); SDK squad (component-sdk); PMM/BD (enterprise contracts, Bangladeshi counsel coordination)
**Critical path:** No — **cross-cutting, continuous**. Touches every other phase; enterprise pilots cannot start without it.
**Parallel stream tag:** `CROSS` — runs in parallel with P00–P22
**Intent:** Build the enterprise-grade substrate that lets IT, Legal, and Security approve Domio at scale: SSO (SAML 2.0, OIDC), SCIM 2.0 provisioning, brand governance dashboard, server-side DLP scanning, tamper-evident append-only audit logs, region-pinned data residency (including a `bd-dhaka` zone), legal-hold and retention enforcement, seat/usage analytics, the public REST + GraphQL API with OAuth 2.1, signed & retried webhooks, a sandboxed plugin and custom-component runtime, and a headless rendering service. This phase is **continuous**: it does not sit on the critical path between P05 and P21; it runs alongside every other phase from P00 onward, hardening each release as it lands. The team progresses through a **Bronze → Silver → Gold → Enterprise-ready** maturity ladder as later phases land, with full enterprise readiness gated before design-partner rollout (P22).

---

## 1. Goals

- **G1.** Ship production-grade identity: SAML 2.0 SP, OIDC RP with PKCE, SCIM 2.0 `/Users` + `/Groups`, group-to-role mapping, JIT/SCIM conflict reconciliation, and domain capture — accepted by Okta, Entra ID, Google Workspace, Ping, JumpCloud, and OneLogin. (Feature #193.)
- **G2.** Ship the brand governance dashboard: tenant-wide on-brand score (0–100) computed from style-lint violations, trend lines, drill-downs, ignore-list exemptions, threshold-driven webhook alerts, and a CSV/PDF violation export. (Feature #194.)
- **G3.** Ship the server-side DLP engine: regex / keyword / dictionary / ML-classifier rules, `block` / `warn` / `log` severities, edit-time delta rescan, pre-built PII / financial / confidential packaging, Bangladesh NID dictionary, and a share/export gate that hard-blocks external shares on a `block` match. (Feature #195.)
- **G4.** Ship the append-only, hash-chained audit log: outbox-pattern writes, immutable bucket (object lock), queryable via admin UI + REST + GraphQL, customer-side verification via `deckctl audit verify`, NDJSON / CSV / signed-bundle export, retention 7 years default. (Feature #196.)
- **G5.** Ship data residency as a first-class construct: tenant-pinned zone, 90-day immutability window, cross-zone acknowledgement, DSR endpoints (access, erasure, rectification, portability, object), sub-processor listing, SOC 2 / GDPR / PDPA evidence locker, and a `bd-dhaka` zone with synchronized real-time local copy for restricted / CII data. (Feature #197.)
- **G6.** Enforce legal hold and retention across every content class (`draft`, `published`, `archived`, `legalHold`, `auditLog`) with dry-run mode, quorum on destructive policy, and separation of duties on hold release. (Feature #198.)
- **G7.** Add admin seat analytics (assigned / active / inactive / dormant), cost-center tagging, license optimization, and anomaly alerting on export bursts. (Feature #199.)
- **G8.** Land the public API + SDKs (TypeScript, Python, Go) generated from a single OpenAPI source, OAuth 2.1 scopes, idempotency keys, rate limits per tier, and async endpoints for long-running ops. (Feature #200.)
- **G9.** Land webhooks with HMAC signing, 5-retry exponential backoff, dead-letter replay, server-side filtering, and agent-trigger target (`mcp://agent/<id>/invoke`). (Feature #201.)
- **G10.** Ship the plugin runtime (iframe + Web Worker double-sandbox, capability broker, per-execution CPU/memory budgets, signed manifests with `minimal`/`verified`/`privileged` tiers) and the `@domio/component-sdk` for custom interactive components with versioned JSON Schema props. (Features #202, #203.)
- **G11.** Ship the headless rendering service: `POST /v1/renders` → async, `png` / `jpeg` / `pdf` / `mp4` outputs, deterministic snapshot semantics, origin allowlist, 5 concurrent renders/tenant, MCP-backed `render_slide_to_image` tool. (Feature #204.)

---

## 2. Scope

### 2.1 In scope (features)

| Feature | Title | Notes |
|---:|---|---|
| #193 | SSO (SAML/OIDC), SCIM provisioning, role hierarchies | Both protocols first-class; SCIM authoritative on conflict |
| #194 | Brand governance dashboard | On-brand score, violations, threshold webhooks |
| #195 | Content DLP rules | Server-side; resolves data bindings; gates share + export |
| #196 | Audit logs (view, edit, share, export) | Append-only, hash-chained, queryable, exportable |
| #197 | Data residency + SOC 2 / GDPR tooling | Zone-pinned tenants; `bd-dhaka` zone with local mirror |
| #198 | Legal hold and retention policies | Per content class; dry-run; quorum on destructive |
| #199 | Usage-based seat analytics | Active/inactive/dormant; cost center; export-burst alerts |
| #200 | Public API + SDK | REST + GraphQL; OAuth 2.1; idempotency; rate limits |
| #201 | Webhooks | HMAC-signed; signed deliveries; dead-letter |
| #202 | Plugin architecture | Iframe + Worker sandbox; capability broker; signed manifests |
| #203 | Custom component development kit | Typed SDK; JSON Schema props; semver; signed `.dcomp` |
| #204 | Headless rendering service | Image/PDF/MP4; origin allowlist; MCP-backed |

### 2.2 Out of scope (explicit)

- **End-user AI features (#108–#125).** The MCP server mounts on the orchestrator built in P12; no AI features in P20.
- **Agentic surfaces (#221–#240).** P13 owns MCP; P20 exposes the API surface that P13 projects over and consumes.
- **Live data sources, animation, 3D, prototyping, audience.** All P08–P11, P15–P16; P20 only consumes their events into the audit log.
- **Marketplace payouts (#28, #41).** P19 owns marketplace; P20 only governs DLP scan of marketplace listings.
- **Novel / frontier features (#205–#219).** P21.
- **Voice / gaze / biometric features (#207, #214).** P20 only enforces the policy envelope (consent, on-device default, retention) — the implementation lives in P12 / P21.
- **Local-first SDK (#232).** Owned by P13; P20 only enables the API keys, OAuth scopes, and webhook triggers used by the SDK.
- **Full PDPA fine-grained compliance certification work.** P20 ships the *tooling*; the actual certification cycle (SOC 2 Type II, ISO 27001) is a parallel program tracked outside the codebase in `docs/11-legal-compliance-bangladesh.md` §11.16.

---

## 3. Dependencies

### 3.1 Upstream (must be partially or fully complete before each workstream lands)

- **P00 — Repo, contracts, dev env.** Provides `/services`, `/packages`, `/contracts`, `/workers`, `/apps` monorepo conventions and the contract layout.
- **P01 — Observability, CI/CD, infra baseline.** Provides OTel SDK, the secret manager (KMS), the CI gates (SAST/DAST/SCA), and Terraform modules for KMS/Postgres/object-store across zones.
- **P02 — Deck schema & scene-graph foundation.** P20 only needs the schema namespaces; full schema stabilization not blocking.
- **P03 — Canvas editor MVP.** Every editor action emits an `audit_event` via the outbox pattern from P03.
- **P04 — CRDT & presence.** Required so deprovisioned users retain 30 days of recoverable CRDT state (#193).
- **P05 — Persistence, versioning, branches.** Provides `deck_version` storage; retention (#198) and audit (#196) build on it.
- **P06 — Components & templates.** Provides the component manifest format that custom components (#203) reuse.
- **P07 — Theming & brand.** Provides the brand kit + design tokens that the governance dashboard (#194) scores against.
- **P08 — Live data & interactive charts.** Provides the data-binding materializer that DLP (#195) scans against rendered values.
- **P12 — AI copilot foundation.** Provides the orchestrator that MCP (P13) and DLP ML-classifier plug into.
- **P13 — Agentic & programmable interfaces.** Provides the MCP server that the public API (#200) and webhook agent triggers (#201) reuse.

### 3.2 Downstream (this phase unblocks or hardens)

- **P14 — Sharing & publishing.** Sharing endpoints are gated by DLP; per-link control (#159) consults residency + audit.
- **P15 — Presenter experience.** Offline rendering uses the same tenants as the headless renderer; presenter view consumes audit events.
- **P16 — Audience participation.** Audience join emits audit events; per-audience watermark is implemented by P20's rendering layer.
- **P17 — Analytics & engagement.** Ingests audit events into per-viewer, per-slide analytics.
- **P18 — Collaboration & workflow.** Review/approval workflows reuse the audit log and DLP engine.
- **P19 — Marketplace.** Marketplace listings are scanned by DLP; creator payouts emit audit events.
- **P21 — Novel & frontier.** P20's consent, on-device default, and retention envelopes are the baseline that P21 builds on.
- **P22 — Polish, scale, GA.** Final enterprise readiness gate runs against the P20 verification matrix.

### 3.3 Continuous-track note

Because this phase is continuous, every other phase must pass the **P20 security gate** (Section 9 Verification matrix) before merging. The relevant checks per phase are summarized in each phase's `Verification` section. Enterprise readiness is **gated**, not on the critical path: a design-partner cannot go-live until the team has reached the **Enterprise-ready** rung of the maturity ladder (Section 5).

---

## 4. Workstreams

### 4.1 WS-X1 — Identity, SSO, SCIM (Bronze, feature #193)

**Tasks (in order):**

1. **T-X1.1 — `identity-svc` skeleton.** Create `/services/identity-svc/` (Rust, axum) with Postgres-backed `sso_config`, `scim_config`, `redis`-backed sessions. Routes under `/sso/saml/{tenantId}/metadata.xml`, `/sso/oidc/{tenantId}/.well-known/openid-configuration`, `/scim/v2/*`.
2. **T-X1.2 — SAML 2.0 SP.** Implement signed `EntityDescriptor`, signed assertion enforcement, encrypted assertion support (`AES-128`/`AES-256`), `RelayState` allowlist, `NameIDFormat=emailAddress`.
3. **T-X1.3 — OIDC RP.** Discovery-driven config, PKCE mandatory for public clients, `state`/`nonce`, `id_token` signature + `aud`/`iss`/`exp` validation, hybrid `response_types` restricted to `code`.
4. **T-X1.4 — SCIM 2.0.** `GET /ServiceProviderConfig`, `GET /Schemas`, `GET/POST/PATCH/DELETE /Users`, `GET/POST/PATCH/DELETE /Groups`, filter expressions on `userName`, `displayName`, `emails`, `active`, pagination via `startIndex`/`count` + `totalResults`. Bearer token hashed (sha256) at rest; raw token shown once at creation.
5. **T-X1.5 — JIT vs SCIM reconciliation.** SCIM wins on conflict; nested group flattening (Okta-style); externalId preferred over displayName.
6. **T-X1.6 — Group → role mapping.** Admin UI to define `idp_group → domio_role` table; role hierarchy enforced (`admin ⊇ editor ⊇ commenter ⊇ viewer`).
7. **T-X1.7 — Domain capture.** DNS TXT verification flow; auto-join on SSO login for matching domains.
8. **T-X1.8 — IdP failure handling.** Local-queue SCIM operations with 24 h backoff; "IdP unavailable" UX for SSO login.
9. **T-X1.9 — Admin UI.** `/admin/identity` page with SSO config, SCIM token QR copy, group mapping table, and SCIM activity live status.

**Files / packages touched**

- `/services/identity-svc/` (new)
- `/apps/admin-web/identity/` (new)
- `/packages/sso-shared/` (new — metadata types, RelayState allowlist)
- `/contracts/openapi/v1/scim.yaml` (new)
- `/contracts/openapi/v1/identity-admin.yaml` (new)
- `/packages/migrations/0020_sso_scim.sql` (new)

**Contracts added / consumed**

- **Added:** `GET /sso/saml/{tenantId}/metadata.xml`, `GET /sso/oidc/{tenantId}/.well-known/openid-configuration`, `POST /scim/v2/Users`, `PATCH /scim/v2/Users/{id}`, `DELETE /scim/v2/Users/{id}`, `GET /scim/v2/Groups`, `POST /scim/v2/Groups`, `POST /v1/admin/identity/sso`, `POST /v1/admin/identity/scim`.
- **Consumed:** `tenant` (P05), `role` / `permission` (P05), `audit_event` (X5).

**Tests written**

- SAML metadata round-trip with simulated IdP.
- OIDC discovery + PKCE flow against a mock provider.
- SCIM `POST /Users` idempotency on `externalId`.
- SCIM `DELETE /Users/{id}` revokes sessions within 5 s.
- Group-mapping applies correctly; nested-group flattening.
- DNS TXT verification happy path + failure path.
- IdP unreachable → queued SCIM operations drain within 24 h.

**Definition of Done (WS-X1 / Bronze)**

- `tier = bronze` predicate holds: SAML + OIDC + SCIM all green in CI against Okta, Entra ID, Google Workspace sandboxes.
- Lighthouse pen-test on `/scim/v2` (signature stripping, token replay) shows 0 P0/P1.
- Audit log records every SSO login, SCIM sync, and deprovision.

---

### 4.2 WS-X2 — Audit log foundation (Silver, feature #196)

**Tasks (in order):**

1. **T-X2.1 — `audit-svc` skeleton.** Create `/services/audit-svc/` (Rust ingest, ClickHouse query). Postgres `audit_event` table with `BIGSERIAL seq` per tenant, `entry_hash`, `prev_hash`, `payload`. Object-store bucket with **object lock** (WORM).
2. **T-X2.2 — Outbox pattern.** `/packages/audit-outbox/` exposes `emit(event)` that writes to the same Postgres transaction as the source action; a follow-up worker drains to the bucket + ClickHouse.
3. **T-X2.3 — Hash chain.** `entry_hash = sha256(canonical_json(seq, prev_hash, payload, …))`. In-memory monotonic counter prevents gaps from rolled-back transactions.
4. **T-X2.4 — Action enum.** Implement the full action type list (`auth.login`, `auth.sso_failure`, `auth.scim_sync`, `user.created`, `user.disabled`, `role.changed`, `deck.viewed`, `deck.edited`, `deck.shared`, `deck.unshared`, `deck.exported`, `dlp.blocked`, `legalhold.placed`, `legalhold.released`, `retention.purged`, `webhook.delivered`, `plugin.installed`, `plugin.executed`, `api.called`).
5. **T-X2.5 — Query API.** `POST /v1/audit/query` GraphQL + REST; p95 ≤ 3 s for 30-day window with 5 filters at 100 M events.
6. **T-X2.6 — Verification CLI.** `deckctl audit verify --from <ts> --to <ts>` recomputes the chain and returns a signed verification report.
7. **T-X2.7 — Admin UI.** `/admin/audit` with the query builder from UX flow §2.4, hash-chain position display, and "Verify chain up to here" button.
8. **T-X2.8 — Privacy layering.** DLP redaction applied to text fields; privacy overrides remove content from `payload` and retain only structural metadata.

**Files / packages touched**

- `/services/audit-svc/` (new)
- `/packages/audit-outbox/` (new)
- `/apps/admin-web/audit/` (new)
- `/contracts/openapi/v1/audit.yaml` (new)
- `/contracts/graphql/audit.graphql` (new)
- `/packages/migrations/0020_audit_event.sql` (new)
- `/cmd/deckctl/audit_verify.go` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/audit/query`, `GET /v1/audit/verify?from=…&to=…`, `POST /graph/audit`.
- **Consumed:** `tenant` (P05), `residency_zone` (X4), every other service's events.

**Tests written**

- Outbox: event for a deck edit is visible within 500 ms after commit.
- Hash chain: tamper with one entry → verification fails.
- Query: p95 ≤ 3 s over 100 M synthetic events with 5 filters.
- Verification: signed report validates against the public key.
- Privacy: content removed when owner has override; structural metadata preserved.

**Definition of Done (WS-X2 / Silver)**

- Append-only enforced at DB role level (no `UPDATE`/`DELETE` role for app users).
- Object-lock bucket + WORM copy configured per zone.
- Append latency p95 ≤ 500 ms verified.
- DLP redaction in audit payloads verified against sample rules.

---

### 4.3 WS-X3 — DLP engine (Silver, feature #195)

**Tasks (in order):**

1. **T-X3.1 — `dlp-svc` skeleton.** Create `/services/dlp-svc/` (Rust workers + Go classifier adapter). Postgres `dlp_rule`, `dlp_scan_result`. Redis scan cache (TTL 10 m).
2. **T-X3.2 — Rule model.** Add `severity` (`block`/`warn`/`log`), `matcher` (`regex`/`keyword`/`dict`/`ml`), `scope` (element types, data sources, folders), `pack_id` (`pii`/`financial`/`confidential`/NULL).
3. **T-X3.3 — Pre-built rule packs.** Ship PII (email, SSN, IBAN, NID, passport, phone), Financial (credit card with Luhn), Confidential keywords. Include Bangladesh NID dictionary `(?i)\bNID[-\s:]?\d{10,17}\b`.
4. **T-X3.4 — Share/export gate.** Hook `services/sharing-svc` and `services/export-pipeline` to call `/v1/dlp/scan` before commit; `block` short-circuits with hard error + "Request exception" email.
5. **T-X3.5 — Edit-time delta rescan.** On element save, call scan against delta only; nightly batched full rescan.
6. **T-X3.6 — Hash-only mode.** Allow tenants to send DLP content as one-way hash; document the false-negative tradeoff.
7. **T-X3.7 — ML classifier adapter.** Pluggable endpoint (Domio-hosted or customer-hosted); 5 s timeout with "needs review" status on timeout.
8. **T-X3.8 — False-positive workflow.** End-user "Not PII" with justification; DLP admin reviews → global allow or re-classify.
9. **T-X3.9 — Audit-log integration.** Every DLP finding emits `dlp.blocked` / `dlp.warned` event; matched text in audit payloads is masked with `████████` per rule-id.

**Files / packages touched**

- `/services/dlp-svc/` (new)
- `/services/sharing-svc/` (modified — gating hook)
- `/services/export-pipeline/` (modified — gating hook)
- `/apps/admin-web/dlp/` (new)
- `/packages/dlp-rules/` (new — Bangladesh NID pack, PII pack, financial pack)
- `/contracts/openapi/v1/dlp.yaml` (new)
- `/packages/migrations/0020_dlp.sql` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/dlp/rules`, `GET /v1/dlp/rules`, `PATCH /v1/dlp/rules/{id}`, `DELETE /v1/dlp/rules/{id}`, `POST /v1/dlp/rules/{id}:preview`, `POST /v1/dlp/rules/{id}:enable`, `POST /v1/dlp/rules/{id}:disable`, `POST /v1/dlp/scan`.
- **Consumed:** `audit_event` (X2), `dlp_rule` (above), `tenant` (P05), data-binding materializer (P08).

**Tests written**

- NID pattern detects `NID 1234567890123` in a deck; `block` severity blocks share.
- Credit card Luhn validation rejects false positives with valid prefix but failing check.
- Share blocked with admin override path email.
- Rescan budget: 200-slide deck with 50 MB text scanned in p95 ≤ 2 s.
- Delta rescan: edit a single element triggers only that element's rescan.
- Audit entry for `dlp.blocked` contains masked snippet + rule id.

**Definition of Done (WS-X3 / Silver)**

- Pre-built PII + financial + BD-NID packs shipping by default.
- Share/export blocked end-to-end in staging.
- Pen test on DLP regex (ReDoS) finds 0 P0/P1.

---

### 4.4 WS-X4 — Residency, retention, legal hold (Gold, features #197, #198)

**Tasks (in order):**

1. **T-X4.1 — `residency-svc` skeleton.** Create `/services/residency-svc/` (Rust sidecar). Postgres `residency_zone` table with `code`, `region`, `storage_bucket`, `feature_availability`.
2. **T-X4.2 — Zone-pinned client library.** `/packages/residency-client/` thin client consulted by every storage write. Bucket-level segregation; cross-zone copy requires explicit `cross-zone-ack`.
3. **T-X4.3 — Tenant creation flow.** `POST /v1/admin/tenants` with `primaryZone`, `drZone`; `residency_locked_until` set to `now() + 90 days`. UI shows feature availability matrix per zone.
4. **T-X4.4 — `bd-dhaka` zone.** Provision zone with **synchronized real-time local copy** for restricted / CII data; verify write consistency encryption semantics with Bangladeshi counsel.
5. **T-X4.5 — Discretionary relocation.** `POST /v1/admin/tenants/{id}/residency` gated by 2-of-3 admin quorum; emits `residency.relocate` audit event.
6. **T-X4.6 — DSR endpoints.** `POST /v1/dsr/access`, `POST /v1/dsr/erasure`, `POST /v1/dsr/rectification`, `POST /v1/dsr/portability`, `POST /v1/dsr/object`. SLAs: 30 days (GDPR Art. 12), 72 h breach notification.
7. **T-X4.7 — `retention-svc`.** Create `/services/retention-svc/` (Python + Rust hot path). Postgres `retention_policy`, `legal_hold`. Nightly cron with dry-run mode.
8. **T-X4.8 — Legal hold precedence.** Hold always wins over retention; release requires a different admin than the placer (separation of duties). End-of-hold cascade re-evaluates retention.
9. **T-X4.9 — Destructive policy quorum.** Policies purging > 1 K items or > 10 GB require a second `compliance-admin` approval.
10. **T-X4.10 — Compliance posture page.** `/admin/compliance` with SOC 2 Type II report link (when available), GDPR DPA link, sub-processor list, breach-notification SLA, data-flow diagram (SVG), evidence locker.
11. **T-X4.11 — Cross-border transfer guardrails.** ABAC policy that requires an admin-signed SCC acknowledgement when a US-only feature is enabled on an `eu-west` tenant.

**Files / packages touched**

- `/services/residency-svc/` (new)
- `/services/retention-svc/` (new)
- `/packages/residency-client/` (new)
- `/apps/admin-web/residency/` (new)
- `/apps/admin-web/retention/` (new)
- `/apps/admin-web/dsr/` (new)
- `/apps/admin-web/compliance/` (new)
- `/packages/migrations/0020_residency.sql` (new)
- `/packages/migrations/0020_retention.sql` (new)
- `/infra/terraform/zone-bd-dhaka/` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/admin/tenants`, `PUT /v1/admin/tenants/{id}/residency`, `POST /v1/admin/tenants/{id}/cross-zone-ack`, `POST /v1/dsr/access`, `POST /v1/dsr/erasure`, `POST /v1/dsr/rectification`, `POST /v1/dsr/portability`, `POST /v1/dsr/object`.
- **Consumed:** `audit_event` (X2), `tenant` (P05), `dlp_rule` (X3), `policy` (X8).

**Tests written**

- Cross-zone write without ack is rejected with `403` + audit event.
- 90-day residency lock enforced; force-relocate requires 2-of-3 admin quorum.
- DSR access exports within 30 days; audit records the request.
- DSR erasure anonymizes under legal hold and logs the action.
- Retention dry-run produces an accurate report.
- Destructive policy with quorum enforced.
- BD synced copy: write to `bd-dhaka` succeeds; read from non-Dhaka zone without `cross-zone-ack` fails.

**Definition of Done (WS-X4 / Gold)**

- All four zones (`eu-west`, `us-east`, `ap-south`, `bd-dhaka`) provisioned in staging.
- DSR end-to-end drill dry-run passes.
- Residency drill (Section 9.9) passes.

> **Open-decision flag:** BD synced-copy semantics (RPO, write consistency, encryption) must be verified against the latest BTRC / Ministry of Law guidance and Bangladeshi counsel before `bd-dhaka` accepts production traffic. See §8 (Risks & open decisions).

---

### 4.5 WS-X5 — RBAC + ABAC + Policy engine (Gold, foundational)

**Tasks (in order):**

1. **T-X5.1 — RBAC extension.** Extend `role` / `role_permission` from P05 with role hierarchy (`parent_id`); built-in roles seeded (`owner`, `compliance-admin`, `legalHoldAdmin`, `billing-admin`).
2. **T-X5.2 — ABAC policy model.** `policy` table with effect (`allow`/`deny`), CEL-like expression tree, targets, priority. `/packages/policy-engine/` evaluates in ≤ 5 ms with cache invalidation on role/attribute change.
3. **T-X5.3 — Permission resolution order.** ABAC deny > ABAC allow > RBAC grants > tenant default.
4. **T-X5.4 — Brand-lock enforcement.** Express brand-locked regions (#36) as a policy: `editor AND deck.brandLockRegions == empty OR user.role == 'admin'`.
5. **T-X5.5 — Cross-border transfer policy.** US-only feature → `eu-west` tenant requires `policy` with effect `allow` and `targets = ['feature.us-only-connector']` + admin-signed SCC.
6. **T-X5.6 — Agent scope composability.** Extend `policy` to support `agent` actor kind with capability token claims (per P13 agent-scoped permissions).

**Files / packages touched**

- `/packages/policy-engine/` (new)
- `/services/auth-svc/` (modified)
- `/packages/migrations/0020_policy.sql` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/policies`, `GET /v1/policies`, `PATCH /v1/policies/{id}`, `DELETE /v1/policies/{id}`, `POST /v1/policies:evaluate`.
- **Consumed:** `role` / `permission` (P05), `tenant` (P05), `audit_event` (X2).

**Tests written**

- Brand-lock policy blocks editor in a locked region.
- ABAC deny overrides RBAC allow.
- Permission resolution completes in ≤ 5 ms p95.
- Cross-border policy requires admin SCC.

**Definition of Done (WS-X5 / Gold)**

- All platform endpoints protect content via the policy engine (no business logic bypasses it).
- Permission service caches properly invalidate on role change.

---

### 4.6 WS-X6 — Brand governance dashboard (Gold, feature #194)

**Tasks (in order):**

1. **T-X6.1 — `gov-svc` skeleton.** Create `/services/gov-svc/` (Node + GraphQL admin UI; Python scoring workers). Postgres `brand_rule`, `brand_violation`. ClickHouse `brand_score_history`.
2. **T-X6.2 — On-brand score.** Rollup of style-lint results (#46) against brand kit (#39) and design tokens (#37). Deterministic + explainable; every score change has a diff of contributing violations.
3. **T-X6.3 — Categories.** Off-palette colors, off-type fonts, off-template layouts, brand-lock edits (#36), accessibility regressions (#44). Severity weighting per tenant; defaults `off-palette=5, off-type=5, brand-lock=10, a11y=8`.
4. **T-X6.4 — Nightly incremental recompute.** For tenants > 10 K decks, score computed nightly; dashboard shows "last computed" timestamp.
5. **T-X6.5 — UI features.** Trend line (30/90/365 days), filters by team/folder/owner/brand-kit/severity, exportable violation report (CSV + PDF), "Fix it" deep-link to offending element.
6. **T-X6.6 — Threshold webhook.** Fires to a tenant-configured webhook subscription when org-wide score drops below a threshold.
7. **T-X6.7 — Ignore-list.** Per-deck/folder exempt from a rule; visible in admin UI.
8. **T-X6.8 — Brand kit rebase.** When a brand kit is updated, every deck's score rebases; "diff vs. previous" widget visible.

**Files / packages touched**

- `/services/gov-svc/` (new)
- `/apps/admin-web/brand/` (new)
- `/packages/lint-engine/` (modified — emit structured violations)
- `/packages/migrations/0020_gov.sql` (new)
- `/workers/brand-scoring/` (new)

**Contracts added / consumed**

- **Added:** `GET /v1/gov/score`, `GET /v1/gov/violations`, `POST /v1/gov/rules`, `POST /v1/gov/rules/{id}:enable`, `POST /v1/gov/rules/{id}:disable`, `GET /v1/gov/ignore-list`, `POST /v1/gov/ignore-list`, `DELETE /v1/gov/ignore-list/{id}`.
- **Consumed:** `brand_kit` (P07), `design_token` (P07), `audit_event` (X2), `webhook_subscription` (X9).

**Tests written**

- Score recomputes within 60 s for 1 K decks, progressively for larger.
- Ignore-list exempts a deck from the configured rule.
- Threshold webhook fires on score drop.
- "Fix it" deep-link opens the editor at the offending element.
- Deterministic: same violations + same brand kit → same score.

**Definition of Done (WS-X6 / Gold)**

- Score appears in admin UI within 60 s of brand kit change for ≤ 1 K-deck tenants.
- CSV export contains each violation with category, severity, deck, slide, element.

---

### 4.7 WS-X7 — Public API + SDKs (Enterprise-ready, feature #200)

**Tasks (in order):**

1. **T-X7.1 — `api-gw` skeleton.** Create `/services/api-gw/` (Rust gateway + Node GraphQL federation). REST base `/v1/*`, GraphQL `/graphql`. Redis rate-limit counters, Postgres consumer registry.
2. **T-X7.2 — OpenAPI source of truth.** `/contracts/openapi/v1/domio.yaml` defines the REST surface; SDK codegen produces TS, Python, Go.
3. **T-X7.3 — OAuth 2.1.** Authorization-code + PKCE for public clients; client-credentials for service accounts. JWTs signed by Domio with 1-hour TTL; refresh token rotation with reuse detection (RFC 6819 §5.2.2.3) — reused refresh token invalidates the entire chain.
4. **T-X7.4 — Idempotency keys.** Every write endpoint accepts `Idempotency-Key`; replays within 24 h return the original response.
5. **T-X7.5 — Rate limits.** Per-tier sliding window: `free` 60 req/min / 10 K req/day; `pro` 600 req/min / 500 K req/day; `enterprise` 6 000 req/min / 10 M req/day, burstable to 12 000/min for 60 s.
6. **T-X7.6 — Async endpoints.** `POST /v1/renders` returns `202 Accepted` + `jobId`; webhook on completion.
7. **T-X7.7 — SDKs.** `packages/domio-sdk-typescript`, `packages/domio-sdk-python`, `packages/domio-sdk-go` published to npm, PyPI, and the internal Go module proxy.
8. **T-X7.8 — MCP convergence.** The `/v1` REST + `/graphql` is the same surface the MCP server (#221) exposes as tools — single source of truth, no drift.
9. **T-X7.9 — Versioning.** Additive → minor bump; breaking → major with 12-month overlap (`v1.x` and `v2.x` both served).
10. **T-X7.10 — Dry-run mode.** `PATCH /v1/decks/{id}?dryRun=true` returns a structured diff without applying; matches human suggestion mode (#182).

**Files / packages touched**

- `/services/api-gw/` (new)
- `/packages/domio-sdk-typescript/` (new)
- `/packages/domio-sdk-python/` (new)
- `/packages/domio-sdk-go/` (new)
- `/contracts/openapi/v1/domio.yaml` (new)
- `/contracts/graphql/domio.graphql` (new)
- `/packages/migrations/0020_api_consumer.sql` (new)

**Contracts added / consumed**

- **Added:** Full REST + GraphQL surface (see §6.6 of `enterprise-governance.md`).
- **Consumed:** `audit_event` (X2), `tenant` (P05), `oauth_scope` (this WS), `webhook_subscription` (X9), `render_job` (X11).

**Tests written**

- Codegen TS/Python/Go + OpenAPI round-trip stable.
- Idempotency: same key within 24 h returns same response.
- Token refresh rotation; reuse detection invalidates chain.
- Rate limit: 6 001st request in a minute returns `429` with `Retry-After`.
- Dry-run: returns diff; no DB write.
- Async render: `202` returned; webhook fires on completion.

**Definition of Done (WS-X7 / Enterprise-ready)**

- All three SDKs published and versioned.
- OpenAPI and GraphQL schemas pass contract tests in CI.
- `deckctl` (X11) is a thin wrapper over the SDK.

---

### 4.8 WS-X8 — Webhooks (Enterprise-ready, feature #201)

**Tasks (in order):**

1. **T-X8.1 — `webhook-svc` skeleton.** Create `/services/webhook-svc/` (Rust dispatcher). Postgres `webhook_subscription`, `webhook_delivery`. Redis queue. Object-store dead-letter.
2. **T-X8.2 — Subscription CRUD.** `POST /v1/webhooks`, `GET /v1/webhooks`, `PATCH /v1/webhooks/{id}`, `DELETE /v1/webhooks/{id}`. Secret double-encrypted (KMS); rotation supported with two valid secrets during rollover.
3. **T-X8.3 — HMAC signing.** `X-Domio-Signature: t=<ts>,v1=<hex_hmac_sha256>` on every delivery.
4. **T-X8.4 — Retry policy.** 5-retry exponential backoff: 1 m, 5 m, 30 m, 2 h, 12 h, then dead-letter.
5. **T-X8.5 — Server-side filtering.** `event_filter` with `action_in` and `target_folder_in`; only matching events delivered.
6. **T-X8.6 — Batch mode.** Up to 100 events per request when configured.
7. **T-X8.7 — Agent-trigger target.** `target_kind='mcp'` with `target_mcp_session=<id>`; dispatches into the MCP server.
8. **T-X8.8 — Replay window.** Events stored 30 days post-creation; admin can replay.
9. **T-X8.9 — Outbound TLS.** Webhook URLs must be HTTPS with publicly trusted cert; mTLS on roadmap.

**Files / packages touched**

- `/services/webhook-svc/` (new)
- `/apps/admin-web/webhooks/` (new)
- `/packages/webhook-signer/` (new)
- `/packages/migrations/0020_webhooks.sql` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/webhooks`, `GET /v1/webhooks`, `PATCH /v1/webhooks/{id}`, `DELETE /v1/webhooks/{id}`, `POST /v1/webhooks/{id}:replay`.
- **Consumed:** `audit_event` (X2), `tenant` (P05), `api_consumer` (X7).

**Tests written**

- HMAC signature verifies with subscriber secret.
- Retry: 5 attempts dead-letter to UI; replay from UI succeeds.
- Filter: subscription with `action_in=['deck.shared']` receives only shares.
- Agent target: webhook → MCP session delivers as a tool call.
- Replay window: 30-day-old event replays successfully.

**Definition of Done (WS-X8 / Enterprise-ready)**

- p95 dispatch latency from event creation to outbound HTTP ≤ 2 s.
- Dead-letter UI exposes replay and reason.

---

### 4.9 WS-X9 — Seat analytics (Gold, feature #199)

**Tasks (in order):**

1. **T-X9.1 — `usage-svc` skeleton.** Create `/services/usage-svc/` (Python ingestion + Node admin API). ClickHouse storage. Per-tenant pre-aggregated rollups (daily/weekly/monthly).
2. **T-X9.2 — Seat model.** `seat_assignment` extends identity with `cost_center`, `department`, `assigned_at`, `last_active_at`, `disabled_at`. Imports from SCIM cost-center fields.
3. **T-X9.3 — Activity classification.** `active` (login within 30 d), `inactive` (no login 90+ d), `dormant` (no login 180+ d).
4. **T-X9.4 — Activity heatmap.** Sessions/day, edits/week, decks created vs. viewed, exports performed.
5. **T-X9.5 — License optimization.** "5 seats inactive 90+ d, 3 eligible for downgrade."
6. **T-X9.6 — Anomaly flagging.** Sudden export spike from a single seat → `seat.alert` webhook + `P2` alert.
7. **T-X9.7 — Service-account pool.** API keys and MCP sessions consume a separate `service-account` pool.
8. **T-X9.8 — Privacy on per-user detail.** Per-user detail requires `compliance-admin` role; audit-logged.
9. **T-X9.9 — Export & digest.** CSV export + monthly email digest.

**Files / packages touched**

- `/services/usage-svc/` (new)
- `/apps/admin-web/seats/` (new)
- `/packages/migrations/0020_seat.sql` (new)
- `/workers/usage-rollup/` (new)

**Contracts added / consumed**

- **Added:** `GET /v1/seats`, `GET /v1/seats/{id}`, `GET /v1/seats/report`, `GET /v1/seats/heatmap`, `POST /v1/seats/digest`.
- **Consumed:** `seat_assignment` (X9), `audit_event` (X2), `webhook_subscription` (X8).

**Tests written**

- Active/inactive/dormant classification correct on synthetic data.
- Cost-center import from SCIM respects group naming.
- Anomaly detection flags a 10-export burst within 5 minutes.
- CSV export contains all fields per-tenant.

**Definition of Done (WS-X9 / Gold)**

- Dashboard p95 ≤ 1 s; export p95 ≤ 10 s for ≤ 10 K seats.
- Service-account pool visible distinctly from human seats.

---

### 4.10 WS-X10 — Plugin runtime + custom component SDK (Enterprise-ready, features #202, #203)

**Tasks (in order):**

1. **T-X10.1 — Plugin manifest schema.** `/contracts/plugins/manifest.schema.json` (new): `id`, `version`, `author`, `permissions` (`canvas`, `data`, `network:outbound:<host>`, `storage`, `export`), `ui` (panel/modal/inline), `entrypoints`, `signature`.
2. **T-X10.2 — `plugin-rt` skeleton.** Create `/apps/canvas-plugin-runtime/` (TypeScript). Iframe + Web Worker double-sandbox; unique origin `sandbox-<tenantId>-<pluginId>.domio.app`.
3. **T-X10.3 — Capability broker.** Mediates every privileged call (`network`, `storage`, `canvas`, `data`, `export`); logs to `audit_event` with `action='plugin.executed'`.
4. **T-X10.4 — Resource budgets.** CPU (ms per 10 s), memory (RSS), storage (bytes), network (req/min). Over-quota → `4xx` + audit.
5. **T-X10.5 — Tier enforcement.** `minimal` (read-only public schema), `verified` (Domio-signed), `privileged` (requires tenant admin approval per install).
6. **T-X10.6 — Plugin registry.** `POST /v1/plugins`, `POST /v1/plugins/{id}/install`, `POST /v1/plugins/{id}/uninstall`. Org-private publishing supported.
7. **T-X10.7 — `@domio/component-sdk`.** TypeScript package at `/packages/component-sdk`. Components declare `defaultProps`, `dataBindings`, `interactiveStates`, `renderHints`, `propsSchema` (JSON Schema 2020-12).
8. **T-X10.8 — Publish flow.** `deckctl component publish` (X11) uploads signed `.dcomp` bundle; `POST /v1/components`. Status flow: `draft` → `published` → `deprecated`.
9. **T-X10.9 — SDK deprecation.** 2-minor-version warning window; `deprecation` webhook fires.
10. **T-X10.10 — Marketplace reuse.** Marketplace creator components (P19) use the same SDK + publish flow.
11. **T-X10.11 — Uninstall safety.** Custom-element slides degrade to a "missing plugin" placeholder with one-click restore.

**Files / packages touched**

- `/apps/canvas-plugin-runtime/` (new)
- `/packages/component-sdk/` (new)
- `/apps/admin-web/plugins/` (new)
- `/contracts/plugins/manifest.schema.json` (new)
- `/packages/migrations/0020_plugin.sql` (new)

**Contracts added / consumed**

- **Added:** `GET /v1/plugins`, `POST /v1/plugins/{id}/install`, `PATCH /v1/plugins/{id}/install`, `POST /v1/plugins/{id}/uninstall`, `POST /v1/components`, `GET /v1/components`, `PATCH /v1/components/{id}`.
- **Consumed:** `audit_event` (X2), `tenant` (P05), `api_consumer` (X7), `webhook_subscription` (X8).

**Tests written**

- Iframe cannot reach parent DOM (cross-origin policy test).
- Web Worker cannot access `window`/`document`.
- Capability broker denies uncached calls; logs to audit.
- Resource budget exceeded → `4xx` + audit.
- Component publish: `draft` → `published` flow; `published` → `deprecated` emits webhook.
- Uninstalled plugin instance renders placeholder.

**Definition of Done (WS-X10 / Enterprise-ready)**

- Lighthouse pen-test on plugin sandbox (DOM access, network exfiltration, prototype pollution) shows 0 P0/P1.
- Plugin installation completes ≤ 3 s; per-execution overhead ≤ 30 ms vs. native.

---

### 4.11 WS-X11 — Headless rendering service (Enterprise-ready, feature #204)

**Tasks (in order):**

1. **T-X11.1 — `render-svc` skeleton.** Create `/services/render-svc/` (Rust orchestrator + TypeScript/WebGL renderer workers). Postgres `render_job`, object-store output, Redis queue.
2. **T-X11.2 — Render API.** `POST /v1/renders` → `202` + `jobId`. `GET /v1/renders/{jobId}` polls status + signed output URL.
3. **T-X11.3 — Formats.** `png`, `jpeg`, `pdf`, `mp4`. MP4 uses frame-blended recorder; default 30 fps; configurable per render.
4. **T-X11.4 — Render options.** Page range, scenario override (#57), locale override (#61), DPI (96/144/300), custom font upload, watermark.
5. **T-X11.5 — Snapshot determinism.** Live data resolved at `renderStart`; identical inputs → byte-identical outputs (within codec tolerance for MP4).
6. **T-X11.6 — Origin allowlist.** Renderer runs in hardened container with no outbound network except Domio control plane and explicitly declared font/CDN hosts.
7. **T-X11.7 — Concurrency limits.** Default 5/tenant; raises with plan. HPA on CPU + queue depth.
8. **T-X11.8 — Pre-flight estimate.** `POST /v1/renders:estimate` returns duration + byte size before commit.
9. **T-X11.9 — LLM-side use.** `render_slide_to_image` MCP tool returns bytes or signed URL with 1-hour TTL.
10. **T-X11.10 — `deckctl` integration.** `deckctl render <deckId> --format pdf --out ./deck.pdf` is a thin wrapper over `/v1/renders`.

**Files / packages touched**

- `/services/render-svc/` (new)
- `/cmd/deckctl/render.go` (new)
- `/packages/migrations/0020_render.sql` (new)
- `/packages/render-allowlist/` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/renders`, `GET /v1/renders/{jobId}`, `POST /v1/renders:estimate`, MCP tool `render_slide_to_image`.
- **Consumed:** `tenant` (P05), `audit_event` (X2), `api_consumer` (X7), `webhook_subscription` (X8), `deck_version` (P05).

**Tests written**

- Deterministic: same input two runs → byte-identical PNG/PDF.
- MP4 30 fps with 30 s animation renders in ≤ 90 s p95.
- Origin allowlist: a request that names a non-allowlisted host is rejected.
- Pre-flight estimate reports within 10 % of actual duration.
- Concurrency cap: 6th concurrent render queued, not rejected.

**Definition of Done (WS-X11 / Enterprise-ready)**

- p50 render of 20-slide deck to PDF ≤ 20 s; to MP4 (30 s animation) ≤ 90 s.
- 1 000 concurrent renders per zone at peak.

---

### 4.12 Maturity ladder (continuous)

The team progresses through four rungs as later phases land. Each rung must be **internal-demo passed** (per the README status legend) before the next rung begins.

| Rung | Required workstreams | Gate demo | Unblocks |
|---|---|---|---|
| **Bronze** | X1 (SSO/SCIM) **[required]** + X2 (audit log) **[required]** | Single IdP (Okta) wired end-to-end; audit log emits from one editor flow; query returns 1 row | First enterprise pilot discussions |
| **Silver** | Bronze + **X3 (DLP)** + **X5 (RBAC+ABAC partial)** | DLP blocks a share; policy engine blocks a brand-lock edit; audit log records all | Enterprise pilot with non-PII data |
| **Gold** | Silver + **X4 (residency + retention + legal hold)** + **X6 (brand gov)** + **X9 (seat analytics)** | Two-zone (e.g., `eu-west` + `bd-dhaka`) deployment; legal hold blocks a delete; brand score dashboard live | Enterprise customers with regulated data |
| **Enterprise-ready** | Gold + **X7 (API/SDK)** + **X8 (webhooks)** + **X10 (plugin runtime + SDK)** + **X11 (headless renderer)** | SAML + SCIM + DLP + residency + audit + API + webhooks + plugins + renderer all live; pen test passed; `deckctl` working | GA and design-partner rollout |

Each rung's Demo (Section 9) is a superset of the prior rung's.

---

## 5. Architecture & data

### 5.1 Services introduced or modified

| Service | Path | Stack | Purpose |
|---|---|---|---|
| `identity-svc` | `/services/identity-svc/` | Rust (axum) | SAML SP, OIDC RP, SCIM 2.0, sessions, JIT |
| `audit-svc` | `/services/audit-svc/` | Rust ingest + ClickHouse | Append-only, hash-chained audit log |
| `dlp-svc` | `/services/dlp-svc/` | Rust workers + Go classifier adapter | DLP scanning on share/export/edit |
| `residency-svc` | `/services/residency-svc/` | Rust sidecar | Zone-pinned routing, cross-zone ack |
| `retention-svc` | `/services/retention-svc/` | Python + Rust hot path | Retention + legal hold + DSR |
| `gov-svc` | `/services/gov-svc/` | Node + GraphQL UI + Python scoring | Brand governance dashboard |
| `api-gw` | `/services/api-gw/` | Rust gateway + Node GraphQL federation | Public REST + GraphQL + async |
| `webhook-svc` | `/services/webhook-svc/` | Rust dispatcher | Signed, retried webhook delivery |
| `usage-svc` | `/services/usage-svc/` | Python ingestion + Node admin API | Seat analytics, anomaly detection |
| `plugin-rt` | `/apps/canvas-plugin-runtime/` | TypeScript | Iframe + Worker sandbox, capability broker |
| `render-svc` | `/services/render-svc/` | Rust orchestrator + TS/WebGL workers | Headless rendering |
| `policy-engine` | `/packages/policy-engine/` | TypeScript (WASM-compiled CEL) | ABAC evaluation ≤ 5 ms |
| `audit-outbox` | `/packages/audit-outbox/` | TypeScript + Rust | Outbox-pattern event emission |
| `residency-client` | `/packages/residency-client/` | TypeScript + Rust | Thin client consulted by every write |

### 5.2 New tables (DDL summary — full DDL in `/packages/migrations/0020_*.sql`)

| Table | Purpose | Key columns |
|---|---|---|
| `tenant` (extended) | Tenant + residency config | `primary_zone_id`, `dr_zone_id`, `residency_locked_until`, `sso_required`, `scim_enabled` |
| `sso_config` | Per-tenant SSO config | `protocol`, `metadata_url`, `discovery_url`, `client_secret_enc`, `pkce_required`, `jit_enabled` |
| `scim_config` | SCIM bearer token (hash) + base URL | `bearer_token_hash`, `base_url`, `last_used_at` |
| `scim_group_role_map` | IdP group → Domio role | `idp_group`, `domio_role_id` |
| `role` / `permission` (extended) | RBAC with hierarchy | `parent_id`, `is_builtin` |
| `policy` | ABAC policy | `effect`, `expr` (JSONB), `targets`, `priority` |
| `dlp_rule` | DLP rules | `severity`, `matcher` (JSONB), `scope` (JSONB), `pack_id` |
| `dlp_scan_result` | DLP findings | `deck_id`, `rule_id`, `match_count`, `snippet_redacted`, `status` |
| `audit_event` | Append-only audit log | `seq`, `tenant_id`, `actor_id`, `action`, `payload`, `prev_hash`, `entry_hash` |
| `residency_zone` | Zone metadata | `code`, `region`, `storage_bucket`, `feature_availability` |
| `retention_policy` | Per-class retention rules | `content_class`, `rule` (JSONB), `enabled` |
| `legal_hold` | Hold on deck/folder/user | `target_kind`, `target_id`, `custodian_id`, `matter_ref`, `placed_by`, `released_by` |
| `seat_assignment` | Seat per user | `role_id`, `cost_center`, `department`, `last_active_at`, `disabled_at` |
| `api_consumer` / `oauth_scope` | Public API consumers | `client_id`, `client_secret_hash`, `rate_limit_tier`, `residency_zone` |
| `webhook_subscription` | Webhook config | `target_url`, `target_kind`, `event_filter`, `secret_enc`, `batch_mode` |
| `webhook_delivery` | Per-attempt delivery state | `event_id`, `attempt_count`, `status`, `next_attempt_at` |
| `plugin` / `plugin_install` | Plugin registry + per-tenant installs | `manifest`, `tier`, `pinned`, `status` |
| `custom_component_package` | Custom components | `version`, `min_sdk_version`, `props_schema`, `bundle_signature`, `status` |
| `render_job` | Render jobs | `deck_id`, `format`, `options`, `status`, `output_url`, `residency_zone` |

### 5.3 New contracts

- `/contracts/openapi/v1/domio.yaml` (public REST surface — single source of truth).
- `/contracts/openapi/v1/scim.yaml`; `identity-admin.yaml`; `audit.yaml`; `dlp.yaml`; `webhooks.yaml`; `components.yaml`; `renders.yaml`; `seats.yaml`; `gov.yaml`; `residency.yaml`; `retention.yaml`; `dsr.yaml`; `policies.yaml`; `plugins.yaml`.
- `/contracts/graphql/domio.graphql` (federated schema).
- `/contracts/graphql/audit.graphql`.
- `/contracts/plugins/manifest.schema.json`.

### 5.4 Master-doc references

- **Architecture:** `/docs/04-system-architecture.md` — service map and zone topology.
- **Data & database:** `/docs/05-data-database-design.md` — RLS, PII field encryption, per-tenant DEK conventions.
- **Technology stack:** `/docs/06-technology-stack.md` — language/storage choices per service.
- **Security:** `/docs/07-security-planning.md` — threat model, controls matrix, secrets, encryption, secure SDLC.
- **Infrastructure:** `/docs/08-infrastructure-devops.md` — Terraform modules for KMS, object store, zones.
- **Bangladesh legal:** `/docs/11-legal-compliance-bangladesh.md` — PDPA, CII, sub-processors, breach notification.
- **Enterprise governance:** `/docs/enterprise-governance.md` — Section 14 master (this phase is the test plan that phase).

### 5.5 Migration ordering

The 0020 migrations are written as idempotent Postgres migrations and split per table group (`0020_sso_scim.sql`, `0020_audit_event.sql`, `0020_dlp.sql`, `0020_residency.sql`, `0020_retention.sql`, `0020_policy.sql`, `0020_gov.sql`, `0020_api_consumer.sql`, `0020_webhooks.sql`, `0020_seat.sql`, `0020_plugin.sql`, `0020_render.sql`). Forward path is required; downgrade scripts are best-effort and not used in production.

---

## 6. Verification

### 6.1 Feature → test → expected result → owner

| Feature | Test | Expected result | Owner |
|---|---|---|---|
| #193 SSO SAML | Configure with Okta sandbox; sign in via SP-initiated | 200 OK; session created; audit `auth.login` | Identity squad |
| #193 SSO OIDC | Configure with Entra ID; sign in via code+PKCE | 200 OK; PKCE enforced; `iss`/`aud`/`exp` validated | Identity squad |
| #193 SCIM | `POST /scim/v2/Users` with `externalId` | 201 Created; idempotent on replay | Identity squad |
| #193 SCIM conflict | JIT + SCIM for same user | SCIM wins; no duplicate | Identity squad |
| #193 Domain capture | DNS TXT verified; new SSO login matching domain | Auto-join tenant | Identity squad |
| #193 IdP failure | IdP unreachable | "IdP unavailable" UX; SCIM queued | Identity squad |
| #194 Brand score | 1 K-deck tenant with 2 brand kits | Score recomputes within 60 s | Governance squad |
| #194 Threshold webhook | Lower score below threshold | Webhook fires to subscription | Governance squad |
| #194 Ignore-list | Add folder to ignore-list | Violations exempt | Governance squad |
| #195 DLP block | Bangladesh NID regex against deck text | External share returns hard error + email | DLP squad |
| #195 DLP rescan | Edit a single element | Only that element rescanned (≤ 200 ms) | DLP squad |
| #195 DLP audit | Match found | `dlp.blocked` event with masked snippet + rule id | DLP squad |
| #195 DLP hash-mode | Tenant opts into hash-only | Only hashed content sent; document false-negative tradeoff | DLP squad |
| #196 Audit append | Source action commits | Audit event visible within 500 ms | Platform squad |
| #196 Audit chain | Tamper with one entry | `deckctl audit verify` reports break | Platform squad |
| #196 Audit query | 30-day window, 5 filters, 100 M events | p95 ≤ 3 s | Platform squad |
| #196 Audit export | Export as signed NDJSON | Signature verifies with public key | Platform squad |
| #196 Audit privacy | Deck with privacy override | `payload` strips content; structural metadata preserved | Platform squad |
| #197 Residency lock | Tenant creation | `residency_locked_until = now() + 90d` | Platform squad |
| #197 Cross-zone | Write to forbidden zone | 403 + `residency.bypass_attempt` audit | Platform squad |
| #197 `bd-dhaka` mirror | Write restricted data | Local mirror sync'd; verified by counsel | Platform squad + DPO |
| #197 DSR access | Synthetic user | Export within 30 days; audit recorded | DPO |
| #197 DSR erasure | Synthetic user | Data removed from prod, backups, object stores within window | DPO |
| #197 Breach notification | Sev1 trigger | Notification within 72 h | Security + DPO |
| #198 Legal hold | Place hold on a deck | Delete attempt blocked; release requires different admin | Compliance squad |
| #198 Retention dry-run | Policy preview | Accurate report with no destructive action | Compliance squad |
| #198 Destructive quorum | Purge > 1 K items | Requires second approval | Compliance squad |
| #199 Seat analytics | 10 K seats | Dashboard p95 ≤ 1 s; export p95 ≤ 10 s | Platform squad |
| #199 Anomaly | 10 exports in 5 min from one seat | `seat.alert` webhook + P2 alert | Platform squad |
| #199 Service-account pool | MCP session + API key | Distinct pool visible | Platform squad |
| #200 API CRUD | `POST /v1/decks` with `Idempotency-Key` | 201 Created; replay returns same | Platform squad |
| #200 API rate limit | 6 001st request in a minute | 429 + `Retry-After` | Platform squad |
| #200 SDK round-trip | OpenAPI → TS / Python / Go SDKs | Generated SDKs pass contract tests | Platform squad |
| #200 Dry-run | `PATCH /v1/decks/{id}?dryRun=true` | Returns structured diff; no write | Platform squad |
| #200 OAuth refresh | Reuse refresh token | Entire chain invalidated | Platform squad |
| #201 Webhook delivery | Configure subscription + secret | HMAC signature verifies | Platform squad |
| #201 Webhook retry | Receiver returns 5xx | 5 attempts then dead-letter | Platform squad |
| #201 Webhook filter | `action_in=['deck.shared']` | Only shares delivered | Platform squad |
| #201 Agent trigger | Webhook → MCP session | MCP tool invoked | Platform squad |
| #202 Plugin sandbox | Plugin tries `parent.document` | Blocked by cross-origin policy | Plugin squad |
| #202 Plugin budget | CPU > quota | 4xx + audit | Plugin squad |
| #202 Plugin tier | `privileged` plugin install | Requires tenant admin approval | Plugin squad |
| #203 Component publish | `deckctl component publish` | 201 Created; status `draft` → `published` | SDK squad |
| #203 Deprecation | Component uses SDK 2 minor behind | Deprecation warning + webhook | SDK squad |
| #203 Uninstall safety | Uninstall a plugin | Existing slides render placeholder | SDK squad |
| #204 Render PDF | 20-slide deck | p50 ≤ 20 s; p95 ≤ 20 s | Render squad |
| #204 Render MP4 | 30 s animation | p95 ≤ 90 s | Render squad |
| #204 Determinism | Same input two runs | Byte-identical PNG/PDF | Render squad |
| #204 Origin allowlist | Non-allowlisted host | Request rejected | Render squad |
| #204 Concurrency | 6th concurrent render | 6th queued, not rejected | Render squad |
| #204 Pre-flight | `POST /v1/renders:estimate` | Estimate within 10 % of actual | Render squad |

### 6.2 Compliance drill checklist (run before each rung promotion)

- **DR drill:** Restore audit log from object store into a fresh region; verify hash chain intact; measure RTO/RPO.
- **DSR drill:** Run full `access` then `erasure` DSR against a synthetic user; verify data is gone from production, backups, and object stores within the documented window.
- **Legal hold drill:** Place a hold on a folder; attempt to delete a deck; verify deletion is blocked; release and verify retention cascade.
- **Residency drill:** Attempt to write to a forbidden zone via an admin bypass; verify the control-plane job catches it within 24 h.
- **Residency cross-zone ack drill:** Enable a US-only feature on an `eu-west` tenant without `cross-zone-ack`; verify refusal.
- **Bangladesh PDPA drill:** Verify `bd-dhaka` synced copy of restricted data with RPO ≤ 5 min; verify encryption-at-rest with per-tenant DEK.
- **DLP drill:** Run a synthetic deck with a NID pattern; verify share is blocked; verify admin override flow logs the exception.
- **Pen test (annual + quarterly internal):** SAML signature stripping, OIDC token replay, SCIM auth bypass, audit tamper, plugin sandbox escape, headless renderer SSRF, webhook signature forgery, ABAC policy escape.
- **RoPA refresh:** Records of processing activities updated; sub-processor list current.
- **Tabletop (quarterly):** Data exposure, ransomware, AI abuse, residency bypass.

### 6.3 Continuous security gate

Every other phase's `Verification` matrix must add three rows for this phase:

- `[P-XX] uses audit outbox pattern` — emits audit events for every action.
- `[P-XX] respects residency` — all storage writes go through `residency-client`.
- `[P-XX] blocked by DLP if applicable` — calls DLP before commit where share/export/edit-time gating applies.

---

## 7. Risks & open decisions

| ID | Risk / decision | Mitigation | Owner |
|---|---|---|---|
| R-SEC-20-01 | **Bangladesh PDPA changing.** Localization rules shifted in February 2026 and further amendments are likely. | Re-verify against official BTRC / Ministry of Law / Bangladesh Bank publications **and Bangladeshi counsel** before `bd-dhaka` accepts production traffic, before each major release, and per `docs/11-legal-compliance-bangladesh.md` §11.19. Hold `bd-dhaka` writes behind a feature flag until counsel signs off. | DPO + Founders |
| R-SEC-20-02 | **AGPL license exposure.** A plugin runtime ecosystem can pull in AGPL dependencies. | CI license check (deny AGPL by default; runtime isolation if approved by legal). Per planning guide §11.7. | Legal + Security |
| R-SEC-20-03 | **Hash chain integrity vs. scale.** 100 M-event tenants strain the canonical-JSON recompute. | Use ClickHouse sorted by `(tenant_id, created_at)`; pre-compute the chain head in Postgres; verify client-side via CLI (#231). | Platform squad |
| R-SEC-20-04 | **SCIM token leak.** A token copied into a chat will trigger SCIM operations. | Hash at rest; rate-limit per token; per-IP allowlist option; require dual-control for the second token. | Identity squad |
| R-SEC-20-05 | **Plugin supply chain.** A signed plugin can still ship malicious code. | Static scan + dependency audit + sand-boxed review; `privileged` tier requires admin approval per install; revocation removes capability tokens and quarantines installs. | Security + Plugin squad |
| R-SEC-20-06 | **Headless renderer SSRF.** A deck schema can declare arbitrary URLs. | Origin allowlist enforced; renderer container has no outbound network by default; `eval`/`Function`/`importScripts` of remote URLs blocked. | Render squad |
| R-SEC-20-07 | **Discretionary relocation.** Authority can order relocation within 60 days. | `residency.relocate` endpoint exists with 2-of-3 admin quorum; portable data formats; tested migration runbooks. | DPO + Platform |
| R-SEC-20-08 | **Cross-border transfer guardrails.** A US-only feature on an `eu-west` tenant risks SCC violation. | ABAC policy that requires admin-signed SCC; transfer notice surfaced in UI. | Legal + Platform |
| R-SEC-20-09 | **Audit storage cost.** 7-year retention at 100 M events/tenant is non-trivial. | Tiered storage (hot ClickHouse → cold object store with WORM); compression on payload; sampling for non-critical events. | Platform squad |
| R-SEC-20-10 | **MCP convergence drift.** The REST/GraphQL and MCP surfaces can drift if not generated from a single source. | OpenAPI source of truth; CI fails if MCP tool schemas don't match REST/GraphQL. | Platform squad |
| OD-SEC-20-01 | **Default-on MFA for non-enterprise users.** (Inherited from `07-security-planning.md` OD-SEC-01.) | Resolve with Security + Product in P03. | Security + Product |
| OD-SEC-20-02 | **BI dashboard SSO passthrough vs. signed URLs.** (Inherited OD-SEC-02.) | Resolve in P17. | Enterprise squad |
| OD-SEC-20-03 | **Tenant DEK re-key cadence.** (Inherited OD-SEC-03; default 1 year.) | Resolve in P04. | Security |
| OD-SEC-20-04 | **Gaze / eye-tracking on-device default.** (Inherited OD-SEC-04.) | Resolve in P21. | Privacy + AI |
| OD-LEG-20-01 | **Engagement of Bangladeshi counsel.** (Inherited OD-LEG-01.) | Resolve before `bd-dhaka` production. | Founders |
| OD-LEG-20-02 | **Local BD entity for commercial launch.** (Inherited OD-LEG-02.) | Resolve before any enterprise BD sale. | Finance + Legal |
| OD-LEG-20-05 | **Residency policy defaults per tenant tier.** (Inherited OD-LEG-05.) | Resolve in P05. | Product + DPO |

---

## 8. Demo

A single 90-minute script that walks every rung from Bronze to Enterprise-ready. Run in staging environment with two zones (`eu-west` + `bd-dhaka`) and one Okta sandbox tenant pre-provisioned.

### 8.1 Setup (5 min)

- Open `https://admin.<zone>.staging.domio.app` as `compliance-admin@acme.staging`.
- Open `https://editor.<zone>.staging.domio.app` as `alice@acme.staging`.
- Open `https://api.<zone>.staging.domio.app/graphql` (GraphQL Playground).
- Open `https://acme.staging.okta.com` (Okta sandbox) on a separate tab.

### 8.2 Enterprise onboarding (10 min) — Bronze rung

1. In **Admin Console → Identity → SSO & SCIM**, paste Okta's SAML metadata URL; save.
2. Toggle **SCIM provisioning**; copy the SCIM base URL + bearer token (one-time).
3. In Okta, paste the SCIM base URL and bearer token into the Domio app's provisioning tab.
4. Assign Alice and Bob to the Domio app; click **Push groups** for `domio-editors` and `domio-admins`.
5. In Okta, click **Test SSO**; complete the SAML flow.
6. In Domio, observe Alice and Bob appear as `editor` and `admin` roles, respectively.
7. Open **Admin Console → Identity → Audit log**; show `auth.login`, `auth.scim_sync`, `user.created`, `role.changed` events.

### 8.3 SSO login (5 min) — Bronze rung

1. In a clean browser profile, navigate to `https://editor.<zone>.staging.domio.app`.
2. Click **Sign in with SSO**.
3. Redirect to Okta; enter Alice's credentials.
4. Land back in the editor with Alice's session; show `last_active_at` updated in the seat dashboard.

### 8.4 DLP rule that catches a forbidden term (10 min) — Silver rung

1. In the editor, Alice opens a deck with a slide containing text "Customer NID 1234567890123."
2. In **Admin Console → Compliance → DLP rules**, show the **Bangladesh NID** rule (enabled by default, severity `block`).
3. Click **Preview** against the deck; show the rule matching one element with a masked snippet.
4. Alice clicks **Share → External share**; explain that the share is blocked.
5. Show the "Request exception" email sent to the DLP admin group.
6. In the audit log, show `dlp.blocked` event with masked snippet + rule id.

### 8.5 Audit log query (10 min) — Silver rung

1. In **Admin Console → Compliance → Audit log**, build a query: `actor = alice@acme.staging, action IN [deck.shared, deck.exported], time = last 30 days, residencyZone = eu-west`.
2. Show the events returned with hash chain position (`seq 18,442`).
3. Click **Verify chain up to here**; show the report signed by Domio.
4. Export as **signed NDJSON bundle**; open in a text editor; show the `X-Domio-Signature` header + chain head.

### 8.6 Brand governance dashboard (10 min) — Gold rung

1. In **Admin Console → Brand → Governance**, show the on-brand score for the tenant.
2. Drill into a deck with a 5-violation list (off-palette, off-type, brand-lock edit, a11y, off-template).
3. Click **Fix it** on the off-palette violation; land in the editor at the offending element with one-click swap.
4. Configure an alert threshold of 80; show the webhook subscription URL.
5. Edit a deck to push the score below 80; show the webhook firing.

### 8.7 Residency + legal hold (10 min) — Gold rung

1. In **Admin Console → Tenant → Residency**, show `primaryZone = eu-west`, `drZone = eu-west-2`, `bd-dhaka` available as third zone.
2. Run a **residency drill** (Section 9.9): attempt to write to `bd-dhaka` from a `eu-west` consumer; show the 403 + audit event.
3. Place a **legal hold** on a folder containing a shared deck.
4. Attempt to delete the deck; show the block + audit event.
5. Release the hold as a different admin (separation of duties); show the cascade to retention.

### 8.8 Public API + webhook (10 min) — Enterprise-ready rung

1. In **Admin Console → API → Consumers**, create consumer `weekly-monday-review-bot` with OAuth scopes `decks:write`, `renders:write`, `webhooks:read`.
2. Use `deckctl` to generate a weekly-review deck from the Snowflake staging data source:
   ```
   deckctl create --template weekly-review --data-source snowflake://staging --render pdf
   ```
3. Show the `202` response + `renderJobId`; webhook fires when the render completes.
4. Show the PDF output (signed URL with 1-hour TTL).
5. Open the GraphQL Playground; show the federated schema.

### 8.9 Plugin runtime + custom componentSDK (10 min) — Enterprise-ready rung

1. In **Admin Console → Plugins**, install the verified `acme.chartkit` plugin.
2. In the editor, open a deck; show the Chart Kit panel loading inside the iframe sandbox.
3. Click on a chart; show the capability broker mediating the data call (audit event `plugin.executed`).
4. Show `deckctl component publish` uploading a custom component `acme.kpi-card` with a JSON Schema `propsSchema`.
5. In the editor, insert the custom component; show the props panel driven by the schema.

### 8.10 Headless renderer (10 min) — Enterprise-ready rung

1. From `deckctl`: `deckctl render <deckId> --format mp4 --scenario "Bear Case" --out ./deck.mp4`.
2. Show the `202` response; poll for completion; webhook fires.
3. Open the MP4; show the animations playing at 30 fps with the Bear Case numbers.
4. Show the pre-flight `--estimate` output within 10 % of the actual duration.

### 8.11 Wrap-up (5 min) — Rung summary

- Confirm Bronze, Silver, Gold, and Enterprise-ready rows in the maturity ladder are all green.
- Hand off the demo recording to DPO for the next compliance drill.

---

## 9. Definition of Done

- [ ] **Code merged.** All 12 services + 12 contracts + 12 migration sets merged to `main`; CI gates green (lint, type, unit, contract, SAST (CodeQL/Semgrep), DAST (OWASP ZAP on staging), SCA (Snyk/Trivy), secret scan, license check).
- [ ] **Contracts versioned.** All new OpenAPI / GraphQL / Protobuf / JSON Schema contracts checked in under `/contracts/` with explicit version numbers; additive → minor bump, breaking → major with 12-month overlap.
- [ ] **Tests pass.** Unit, integration, contract, and property-based tests pass; p95/p99 measured against the §6.1 matrix; fuzz and prompt-injection eval suites pass.
- [ ] **Telemetry in place.** RED metrics for every service; USE for GPU workers; OpenTelemetry traces sampled at 10 % by default, 100 % for 4xx/5xx; audit log ingest rate + chain health + dead-letter depth + DLP scan budget + render queue depth dashboards; P0/P1/P2 alerts configured.
- [ ] **Docs updated.** `/docs/07-security-planning.md`, `/docs/08-infrastructure-devops.md`, `/docs/11-legal-compliance-bangladesh.md`, `/docs/enterprise-governance.md` and every other phase doc's `Verification` matrix updated to reference the P20 continuous security gate.
- [ ] **Compliance drill passed.** DR, DSR, legal hold, residency, cross-zone ack, Bangladesh PDPA, DLP drills all green in staging (per §9.9); pen-test remediation backlog triaged; RoPA refreshed; sub-processor list current.
- [ ] **Maturity rung demo passed.** Internal demo for Bronze (X1 + X2), Silver (+ X3 + X5), Gold (+ X4 + X6 + X9), and Enterprise-ready (+ X7 + X8 + X10 + X11) recorded and reviewed by DPO + Security lead.
- [ ] **Continuous security gate promoted.** Other phases' `Verification` matrices contain the three required P20 rows (audit outbox, residency, DLP gating).
- [ ] **Bangladeshi counsel verification (for `bd-dhaka` production).** Counsel sign-off on PDPA, CII data classes, synced-copy semantics, and breach-notification timelines; copy attached to `/docs/11-legal-compliance-bangladesh.md` §11.19.

---

_End of phase-20-security-enterprise.md._
