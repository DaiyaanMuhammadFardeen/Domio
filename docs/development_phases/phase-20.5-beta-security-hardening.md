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

# Phase 20.5 — Beta Security Hardening (Application-only subset of P20)

**Phase:** 20.5
**Name:** Beta security hardening (application security subset of P20)
**Owner(s):** Security lead (overall); Platform/API squad (auth, rate limiting, audit, DLP warnings); Frontend squad (policy engine UX, share-gate UI)
**Critical path:** No — but **blocks public beta launch**. Must land before any external user can sign up.
**Parallel stream tag:** `CROSS` — runs alongside P03–P14, gates beta access to all of them.
**Intent:** This is the **beta-only cut of P20**. The full P20 (`phase-20-security-enterprise.md`) targets enterprise pilots with IT/Legal/Security review, SOC 2, regulated data, and Bangladesh PDPA. That scope is ~34–44 weeks of work and requires founder-driven non-engineering hurdles (Bangladeshi counsel, sub-processor list, SCC adoption, AGPL stance, code-signing CA). P20.5 ships **only the application-security subset** that real beta users need so the app is safe enough for the public to use: a real RBAC + ABAC policy engine, a lightweight audit log you can query, soft DLP warnings on risky share content, rate limiting against abuse, and a tightened secrets posture. Everything else (SSO/SCIM, full hash-chained audit, residency, legal hold, brand governance, public API/SDKs, webhooks, plugin sandbox, headless rendering, `bd-dhaka`) is **explicitly deferred** to the full P20 once product-market fit is established. P20.5 exists so beta can launch without waiting for enterprise compliance work.

---

## 1. Goals

- **G1.** Ship a real **policy engine** with RBAC role hierarchy (`owner` ⊇ `admin` ⊇ `editor` ⊇ `commenter` ⊇ `viewer`) and a lightweight ABAC layer for two cases (brand-locked regions, deck-shared-with-public). Permission resolution completes in ≤ 5 ms p95. Every protected endpoint consults the policy engine — no business logic bypasses it. (Subset of P20 WS-X5.)
- **G2.** Ship a **lightweight audit log**: every state-changing action (`auth.login`, `deck.created`, `deck.edited`, `deck.shared`, `deck.exported`, `role.changed`, `user.disabled`, `billing.changed`) writes a row to `audit_event` via the outbox pattern. Queryable from a minimal admin UI for the team. 90-day retention default. No hash chain, no ClickHouse, no WORM bucket — just a Postgres table with a sane index. (Subset of P20 WS-X2.)
- **G3.** Ship **soft DLP warnings** on share and export: regex check for credit-card-shaped numbers, email-shaped strings, and US SSN-shaped strings. Result is a **warning banner**, not a hard block. Users see "This deck contains what looks like a credit card number. Continue?" with a one-click bypass that is itself audited. (Subset of P20 WS-X3 — warning-only v1.)
- **G4.** Ship **rate limiting + abuse basics**: per-IP and per-user sliding-window limits on `/auth/*`, `/signup`, `/share/*`, `/export/*`. Aggressive CAPTCHA on signup. Per-tenant exponential backoff on 5xx bursts. P2 alert if any single IP hits the limit 10× in a minute. (New in P20.5; full version is absorbed by full P20 WS-X7.)
- **G5.** Verify the **secrets + auth posture** from P00–P01 is solid before opening up: no hardcoded credentials (gitleaks in CI), all secrets in KMS/Vault, all cookies `Secure` + `HttpOnly` + `SameSite=Lax`, CSRF on all state-changing endpoints, CSP set on every web response, password hashing with Argon2id (cost ≥ 19 MiB), MFA optional but **default-on for `admin` and `owner` roles**.
- **G6.** Run a **self-pen-test pass** before beta opens: dependency audit (Snyk/Trivy), SAST (CodeQL + Semgrep), DAST (OWASP ZAP) against staging, and a manual review of the top-10 OWASP risks. Resolve every P0/P1 finding before allowing external signups.

---

## 2. Scope

### 2.1 In scope (features)

| Feature | Source | Title                                       | Notes                                                                    |
| ------: | ------ | ------------------------------------------- | ------------------------------------------------------------------------ |
|   #193a | P20.X1 | Email/password + Google/GitHub OAuth        | Full P20 WS-X1 deferred; this is the minimum identity surface beta needs |
|   #193b | P20.X1 | RBAC role hierarchy + ABAC for two cases    | P20 WS-X5, scoped down                                                   |
|   #193c | P20.X1 | Default-on MFA for `admin`/`owner`          | Optional for other roles; TOTP via authenticator app                     |
|   #196a | P20.X2 | Lightweight audit log (Postgres + admin UI) | Subset of P20 WS-X2                                                      |
|   #195a | P20.X3 | Soft DLP warnings on share/export           | Subset of P20 WS-X3 — warning-only, no block                             |
|     New | P20.5  | Rate limiting on auth/share/export          | New: not in original P20 doc, added for beta                             |
|     New | P20.5  | Self-pen-test gate                          | New: must pass before beta opens                                         |
|      #7 | P01    | Secrets management posture verification     | Inherited from P00–P01; verify, don't introduce                          |

### 2.2 Out of scope (explicit — deferred to full P20 or never)

- **SSO (SAML 2.0, OIDC at the IdP level).** Beta users authenticate via email/password or OAuth providers. (Full P20 WS-X1.)
- **SCIM 2.0 provisioning.** Manual user invite flow is fine for beta. (Full P20 WS-X1.)
- **Domain capture, JIT, group→role mapping.** (Full P20 WS-X1.)
- **Hash-chained audit log, WORM bucket, ClickHouse, `deckctl audit verify`, 7-year retention.** (Full P20 WS-X2.)
- **DLP rule engine, pre-built packs (PII/financial/BD-NID), ML classifier, hard `block` severity, admin override flow.** (Full P20 WS-X3.)
- **Data residency, `bd-dhaka` zone, retention policies, legal hold, DSR endpoints, sub-processor list, Bangladeshi counsel engagement.** (Full P20 WS-X4.)
- **Brand governance dashboard, on-brand score, threshold webhooks.** (Full P20 WS-X6.)
- **Public API + SDKs (TS/Python/Go), OAuth 2.1, idempotency keys, tiered rate limits.** (Full P20 WS-X7.)
- **Webhooks (HMAC, retry, dead-letter, agent targets).** (Full P20 WS-X8.)
- **Seat analytics, anomaly detection, license optimization, cost-center import.** (Full P20 WS-X9.)
- **Plugin runtime (iframe + Worker sandbox), capability broker, `@domio/component-sdk`.** (Full P20 WS-X10.)
- **Headless rendering service, MCP `render_slide_to_image` tool.** (Full P20 WS-X11.)
- **Tabletop exercises, RoPA refresh, sub-processor DPA, SCC adoption, AGPL stance, code-signing CA.** (Full P20 §7 risks + non-engineering hurdles.)

### 2.3 Out of scope (explicit — never in P20)

- **End-user AI features (#108–#125).** P12.
- **Agentic surfaces (#221–#240).** P13.
- **Live data, animation, 3D, prototyping, audience, marketplace.** All later phases.

---

## 3. Dependencies

### 3.1 Upstream (must be partially or fully complete before each workstream lands)

- **P00 — Repo, contracts, dev env.** Provides `/services`, `/packages`, `/contracts`, `/workers`, `/apps` monorepo conventions and the contract layout. Without P00, none of P20.5 can start.
- **P01 — Observability, CI/CD, infra baseline.** Provides OTel SDK, the secret manager (KMS), the CI gates (SAST/DAST/SCA), and the Terraform modules. **P20.5 G5 (secrets posture verification) hard-depends on P01.**
- **P02 — Deck schema & scene-graph foundation.** Provides the schema namespaces that audit-log entries (`deck.created`, `deck.edited`) reference.
- **P03 — Canvas editor MVP.** Every editor action emits an audit event via the outbox pattern from P03. P20.5 G2 hard-depends on P03 emit hooks existing.
- **P05 — Persistence, versioning, branches.** Provides `deck_version` storage and `tenant` + `user` + `role` tables that the policy engine and audit log extend. P20.5 G1 hard-depends on `role`/`permission` tables existing.

### 3.2 Downstream (this phase unblocks or hardens)

- **P14 — Sharing & publishing.** The soft DLP warning (G3) is the first gate on share/publish. Hard gates come in full P20 WS-X3.
- **P22 — Polish, scale, GA.** Before P22 ships, every P20.5 workstream must be replaced by its full P20 equivalent (or formally documented as "still scoped to P20.5" — e.g., DLP warnings may ship to GA as warnings rather than blocks, depending on beta feedback).
- **All phases P06–P19.** P20.5's rate limits and audit log are tested against every other phase's actions before beta opens.

### 3.3 Launch-gate note

P20.5 is **not on the critical path between P05 and P22**, but it **is** a launch gate for the public beta. Beta signups cannot open until the DoD in §9 is green. The team progresses through three rungs:

| Rung            | Required workstreams                                                    | Gate                                                                                   |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Locked**      | G1 (policy engine) **[required]** + G5 (secrets posture) **[required]** | Internal users only; no external signup; rate limit on `/signup` enforces invite codes |
| **Beta-ready**  | Locked + G2 (audit log) + G3 (DLP warnings) + G4 (rate limits)          | Open beta to first 100 invited users; all four workstreams green in CI                 |
| **Public beta** | Beta-ready + G6 (self-pen-test pass)                                    | Open signup; full public launch gating behind P06–P14 readiness                        |

---

## 4. Workstreams

### 4.1 WS-B1 — Policy engine + RBAC + scoped ABAC (Locked, feature #193b)

**Tasks (in order):**

1. **T-B1.1 — `policy-engine` package skeleton.** Create `/packages/policy-engine/` (TypeScript, no WASM yet). Evaluates `(subject, action, resource, context)` against a static rule set. Target ≤ 5 ms p95.
2. **T-B1.2 — Built-in roles.** Seed `owner`, `admin`, `editor`, `commenter`, `viewer` with the hierarchy in §1.G1. `role.parent_id` already exists in P05; this workstream wires enforcement.
3. **T-B1.3 — Permission resolution order.** Implement ABAC deny > ABAC allow > RBAC grants > tenant default. Hook on every protected endpoint middleware.
4. **T-B1.4 — Two ABAC cases.**
   - **Brand-locked regions (#36).** `editor` blocked from editing elements in a `brandLockRegions` region unless `user.role == 'admin'`.
   - **Public share.** Editor can create a public share link only if the deck has no element flagged `containsRestrictedData`.
5. **T-B1.5 — Default-on MFA for privileged roles.** `admin` and `owner` users must enroll TOTP on first login after role assignment. Other roles opt-in. Backed by `user.mfa_enrolled_at` column.
6. **T-B1.6 — Admin UI.** `/admin/roles` lists roles + member counts; `/admin/users/{id}` shows granted roles and ABAC attributes. No editing in P20.5 (admin managed via DB seed or invite-time role assignment).
7. **T-B1.7 — Forbidden-bypass detection.** Backend middleware logs every request to a protected endpoint with the resolved policy. Use this to verify no endpoint bypasses the engine in tests.

**Files / packages touched**

- `/packages/policy-engine/` (new)
- `/services/auth-svc/` (modified — middleware uses policy engine)
- `/apps/admin-web/roles/` (new — read-only)
- `/packages/migrations/0025_role_hierarchy.sql` (new — `parent_id`, `is_builtin` columns)
- `/packages/migrations/0025_user_mfa.sql` (new — `mfa_enrolled_at`, `mfa_secret_enc`)

**Contracts added / consumed**

- **Added:** `policy.evaluate` internal gRPC; admin read endpoints `GET /v1/admin/roles`, `GET /v1/admin/users/{id}/permissions`.
- **Consumed:** `role` / `permission` (P05), `tenant` (P05), `user` (P03).

**Tests written**

- Role hierarchy: `admin` can do everything `editor` can.
- Permission resolution completes in ≤ 5 ms p95 over 10 K synthetic requests.
- Brand-locked region blocks `editor`; allows `admin`.
- No protected endpoint is reachable without hitting the policy engine (verified by middleware test that strips policy and expects 403).
- MFA enrollment enforced on first `admin`/`owner` login; bypass attempts audited.

**Definition of Done (Locked rung)**

- Every protected endpoint rejects requests that bypass the policy engine (verified by fuzz test removing middleware).
- MFA enrollment flow tested end-to-end.
- Role hierarchy + two ABAC cases shipped behind a feature flag in staging.

---

### 4.2 WS-B2 — Lightweight audit log (Beta-ready, feature #196a)

**Tasks (in order):**

1. **T-B2.1 — `audit_event` table.** Postgres table: `id` (uuid), `tenant_id`, `actor_id`, `actor_kind` (`user`/`api_key`/`system`), `action` (enum), `target_kind`, `target_id`, `metadata` (JSONB), `ip`, `user_agent`, `created_at`. Index on `(tenant_id, created_at DESC)`.
2. **T-B2.2 — Outbox writer.** `/packages/audit-outbox/` exposes `emit(event)` that writes to the same Postgres transaction as the source action. **No separate worker, no ClickHouse, no WORM bucket.** Just a synchronous insert in the same tx.
3. **T-B2.3 — Action enum.** Cover the actions in G2: `auth.login`, `auth.login_failure`, `auth.logout`, `auth.mfa_enrolled`, `auth.password_changed`, `user.created`, `user.disabled`, `user.role_changed`, `deck.created`, `deck.edited`, `deck.deleted`, `deck.shared`, `deck.unshared`, `deck.exported`, `share.created`, `share.revoked`, `billing.changed`, `dlp.warning_shown`, `dlp.bypass_acknowledged`, `policy.denied`.
4. **T-B2.4 — Admin query UI.** `/admin/audit` with a simple filter form (tenant, actor, action, time range, target). Pagination 50/page. No fancy GraphQL — just server-rendered table.
5. **T-B2.5 — Retention job.** Nightly cron deletes rows older than 90 days. Configurable per tenant via `tenant.audit_retention_days`. Logs the deletion count to a separate `audit_retention_run` table.
6. **T-B2.6 — Export.** CSV export of filtered events. No signature, no signed bundle — that lands in full P20 WS-X2.

**Files / packages touched**

- `/packages/audit-outbox/` (new)
- `/apps/admin-web/audit/` (new — read-only)
- `/packages/migrations/0025_audit_event.sql` (new)

**Contracts added / consumed**

- **Added:** `GET /v1/admin/audit` (REST, paginated), `GET /v1/admin/audit/export` (CSV).
- **Consumed:** `tenant` (P05), `user` (P03).

**Tests written**

- Outbox: `deck.created` event is visible in `audit_event` within the same transaction.
- Query: `GET /v1/admin/audit?action=deck.shared&from=…&to=…` returns matching rows.
- Retention: 91-day-old rows are deleted by the nightly job; 89-day-old rows are kept.
- Sensitive fields (passwords, MFA secrets) never appear in `metadata`.
- CSV export includes all filtered rows.

**Definition of Done (Beta-ready rung)**

- Every state-changing action in §4.2.3 emits an audit event.
- Query UI loads in ≤ 1 s for 7-day windows at 100 K events.
- 90-day retention runs nightly without manual intervention.

---

### 4.3 WS-B3 — Soft DLP warnings (Beta-ready, feature #195a)

**Tasks (in order):**

1. **T-B3.1 — `dlp-warn` package skeleton.** Create `/packages/dlp-warn/` (TypeScript). Synchronous regex check; no async adapter, no ML, no DB.
2. **T-B3.2 — Rule set (regex-only).**
   - Credit card: `(?:\b(?:\d[ -]*?){13,16}\b)` with Luhn validation to reduce false positives.
   - Email: RFC-5322 simplified `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`.
   - US SSN: `\b\d{3}-\d{2}-\d{4}\b`.
   - **No Bangladesh NID yet** — full P20 WS-X3 ships that with Bangladeshi counsel sign-off.
3. **T-B3.3 — Share-gate hook.** `/services/sharing-svc` calls `dlp-warn.scan(deck)` before generating a share link. If matches found, return `200` with `{ warning: true, matches: [...] }` instead of hard-blocking. The frontend renders a banner.
4. **T-B3.4 — Export-gate hook.** Same as B3.3 for `/services/export-pipeline`. PDF/PNG/MP4 export goes through the same warning pattern.
5. **T-B3.5 — Bypass acknowledgement.** If the user clicks "Share anyway," log `dlp.bypass_acknowledged` to the audit log with the matched rule IDs and snippet preview. **No admin override flow** in P20.5 — full P20 WS-X3 adds that.
6. **T-B3.6 — Admin visibility.** `/admin/dlp` shows aggregate counts: "47 shares warned in the last 7 days, 12 bypassed." No per-deck drill-down in P20.5.

**Files / packages touched**

- `/packages/dlp-warn/` (new)
- `/services/sharing-svc/` (modified — gate hook)
- `/services/export-pipeline/` (modified — gate hook)
- `/apps/admin-web/dlp/` (new — summary only)
- `/apps/web/` (modified — share modal banner)

**Contracts added / consumed**

- **Added:** `POST /v1/dlp-warn/scan` (internal), `GET /v1/admin/dlp/summary`.
- **Consumed:** `audit_event` (B2).

**Tests written**

- Credit card Luhn: valid `4111-1111-1111-1111` triggers warning; invalid `4111-1111-1111-1112` does not.
- Email regex catches standard form; ignores `user@localhost`.
- SSN regex catches `123-45-6789`; ignores `123456789`.
- Share with NID-like content shows warning; user can bypass; bypass is audited.
- Export with credit-card-shaped text shows warning.
- Bypass count visible in admin summary.

**Definition of Done (Beta-ready rung)**

- All three regex rules ship behind a feature flag.
- Share and export flows show warning banners on match.
- Bypass is audited.
- No hard block anywhere in P20.5 (full P20 WS-X3 adds hard blocks).

### 4.4 WS-B4 — Rate limiting + abuse basics (Beta-ready, new)

**Tasks (in order):**

1. **T-B4.1 — Rate-limit middleware.** `/packages/rate-limit/` (Rust for backend, TypeScript for BFF). Sliding-window counter in Redis. Key on `(ip, route)` for unauthenticated, `(user_id, route)` for authenticated.
2. **T-B4.2 — Default limits.**
   - `POST /auth/login`: 10 / min / IP.
   - `POST /auth/signup`: 5 / hour / IP.
   - `POST /share/*`: 30 / min / user.
   - `POST /export/*`: 10 / min / user.
   - `GET /v1/*` (read): 300 / min / user.
   - Configurable per route via env.
3. **T-B4.3 — CAPTCHA on signup.** hCaptcha on `/signup`; bypass if env `DISABLE_CAPTCHA=true` for dev.
4. **T-B4.4 — 429 response.** Returns `Retry-After` header + JSON body. Audit event `rate_limit.exceeded` with route + IP/user.
5. **T-B4.5 — Anomaly alerting.** If a single IP exceeds any limit 10× in a 60-second window, fire P2 alert (`rate_limit.burst`) and `audit_event` with `action=rate_limit.anomaly`.
6. **T-B4.6 — Tenant-level circuit breaker.** If a tenant emits 5xx at > 50 % rate over 5 minutes, throttle that tenant to 10 % of normal limits and alert on-call. Reset on next green 5-minute window.

**Files / packages touched**

- `/packages/rate-limit/` (new)
- `/services/api-gw/` (new in P20.5 — minimal, just the middleware host; full version is P20 WS-X7)
- `/packages/migrations/0025_rate_limit.sql` (new — `rate_limit_event` table for audit)

**Contracts added / consumed**

- **Added:** `GET /v1/admin/rate-limit/status` (read-only).
- **Consumed:** `audit_event` (B2), `tenant` (P05).

**Tests written**

- 11th login attempt in 1 minute returns 429 with `Retry-After`.
- Signup after 5 in an hour returns 429.
- Anomaly alert fires on 10× burst within 60 s.
- Tenant circuit breaker engages at 50 % 5xx rate.
- 429 response carries valid `Retry-After`.

**Definition of Done (Beta-ready rung)**

- All listed routes enforce limits.
- CAPTCHA on signup.
- 429s are audited.
- Anomaly alert wired to PagerDuty/Opsgenie.

### 4.5 WS-B5 — Secrets + auth posture verification (Locked, feature #7 inherited)

**Tasks (in order):**

1. **T-B5.1 — Secret scan in CI.** Add `gitleaks` to the lint pipeline; fail on any secret (including historical commits if `--redact` is too generous).
2. **T-B5.2 — KMS check.** Verify every secret in `.env.example` is fetched from KMS/Vault at boot, not shipped in the image. Audit any hardcoded fallbacks.
3. **T-B5.3 — Cookie hardening.** Every Set-Cookie header: `Secure`, `HttpOnly`, `SameSite=Lax`. Reject on missing.
4. **T-B5.4 — CSRF.** Double-submit cookie pattern on every state-changing endpoint. Verify in integration tests.
5. **T-B5.5 — CSP.** Strict CSP on every web response: `default-src 'self'`, no `'unsafe-inline'`, no `'unsafe-eval'`. Asset domains explicitly allowlisted.
6. **T-B5.6 — Password hashing.** Argon2id with cost ≥ 19 MiB. Migration script for any accounts still on bcrypt or worse.
7. **T-B5.7 — Session security.** JWTs short-lived (15 min access, 7-day refresh with rotation). Refresh tokens stored hashed at rest. Reuse detection invalidates the chain (RFC 6819 §5.2.2.3).

**Files / packages touched**

- `/services/auth-svc/` (modified — hashing, session, CSRF)
- `/apps/web/` (modified — CSP, cookie attrs)
- `/infrastructure/terraform/kms/` (verified, not modified unless gaps found)
- `.github/workflows/lint.yml` (modified — gitleaks step)

**Contracts added / consumed**

- **Added:** None (this is hardening, not a new surface).
- **Consumed:** P00–P01 deliverables.

**Tests written**

- gitleaks: sample commit with a fake AWS key fails the build.
- Cookie: response with `Set-Cookie` missing `Secure` is rejected by integration test.
- CSRF: state-changing request without CSRF token returns 403.
- CSP: response missing `Content-Security-Policy` header fails integration test.
- Password: legacy bcrypt hash is migrated on next login.
- Session: reused refresh token invalidates the entire chain.

**Definition of Done (Locked rung)**

- gitleaks green in CI.
- Every secret read from KMS at boot in staging.
- Cookies all `Secure` + `HttpOnly` + `SameSite=Lax`.
- CSP enforced on every web route.
- Password hashing verified Argon2id.
- Session refresh rotation + reuse detection tested.

### 4.6 WS-B6 — Self-pen-test gate (Public beta rung, new)

**Tasks (in order):**

1. **T-B6.1 — SAST.** Run CodeQL + Semgrep over the entire monorepo. Triage findings.
2. **T-B6.2 — SCA.** Run Snyk + Trivy on every container image. Triage findings.
3. **T-B6.3 — DAST.** Run OWASP ZAP baseline scan against staging. Triage findings.
4. **T-B6.4 — Manual OWASP top-10 review.** Engineer-driven walkthrough of injection, broken auth, sensitive data exposure, XXE, broken access control, misconfig, XSS, insecure deserialization, vulnerable components, insufficient logging.
5. **T-B6.5 — Triage + fix.** Every P0/P1 must be fixed before public beta. P2/P3 can be filed as tickets with due dates.
6. **T-B6.6 — Re-run.** All scans must be green before launching public beta.

**Files / packages touched**

- `.github/workflows/security.yml` (new — orchestrates all scans)
- `/docs/07-security-planning.md` (updated with P20.5 verification matrix)

**Tests written**

- SAST scan returns 0 P0/P1.
- SCA scan returns 0 P0/P1 (or documented exceptions).
- DAST scan returns 0 P0/P1.
- Manual review checklist signed off by Security lead.

**Definition of Done (Public beta rung)**

- All P0/P1 across SAST + SCA + DAST + manual review resolved.
- Pen-test report attached to `/docs/07-security-planning.md` appendix.
- Re-scan green.

### 4.7 Rung summary

| Rung            | Required workstreams                                           | Unblocks                                             |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| **Locked**      | B1 (policy engine) + B5 (secrets posture) **[required]**       | Internal users with invite codes; no external signup |
| **Beta-ready**  | Locked + B2 (audit log) + B3 (DLP warnings) + B4 (rate limits) | Open beta to first 100 invited users                 |
| **Public beta** | Beta-ready + B6 (self-pen-test pass)                           | Open public signup                                   |

Each rung's verification (§6) is a superset of the prior rung's.

---

## 5. Architecture & data

### 5.1 Services & packages introduced or modified

| Service / Package  | Path                         | Stack                             | Purpose                                               |
| ------------------ | ---------------------------- | --------------------------------- | ----------------------------------------------------- |
| `policy-engine`    | `/packages/policy-engine/`   | TypeScript                        | RBAC + scoped ABAC evaluation, ≤ 5 ms p95             |
| `audit-outbox`     | `/packages/audit-outbox/`    | TypeScript + Postgres             | Synchronous audit emission in source tx               |
| `dlp-warn`         | `/packages/dlp-warn/`        | TypeScript                        | Regex-based warning-only DLP                          |
| `rate-limit`       | `/packages/rate-limit/`      | Rust (backend) + TypeScript (BFF) | Sliding-window rate limiting                          |
| `api-gw` (minimal) | `/services/api-gw/`          | Rust                              | Rate-limit middleware host; full version is P20 WS-X7 |
| `auth-svc`         | `/services/auth-svc/`        | (inherited)                       | MFA, hashing, session, CSRF                           |
| `sharing-svc`      | `/services/sharing-svc/`     | (inherited)                       | DLP warning hook on share                             |
| `export-pipeline`  | `/services/export-pipeline/` | (inherited)                       | DLP warning hook on export                            |
| `admin-web`        | `/apps/admin-web/`           | (inherited)                       | Roles, audit, DLP summary, rate-limit status pages    |

### 5.2 New tables (DDL summary — full DDL in `/packages/migrations/0025_*.sql`)

| Table                 | Purpose               | Key columns                                                                                                                     |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `role` (extended)     | RBAC role hierarchy   | `parent_id`, `is_builtin`                                                                                                       |
| `user` (extended)     | MFA state             | `mfa_enrolled_at`, `mfa_secret_enc`                                                                                             |
| `audit_event`         | Lightweight audit log | `id`, `tenant_id`, `actor_id`, `actor_kind`, `action`, `target_kind`, `target_id`, `metadata`, `ip`, `user_agent`, `created_at` |
| `audit_retention_run` | Retention job ledger  | `run_at`, `rows_deleted`, `tenant_id`                                                                                           |
| `rate_limit_event`    | Rate-limit audit      | `key`, `route`, `occurred_at`, `count`                                                                                          |

### 5.3 New contracts

- `/contracts/openapi/v1/audit.yaml` (admin query + export).
- `/contracts/openapi/v1/rate-limit.yaml` (status read).
- `/contracts/openapi/v1/dlp-warn.yaml` (internal scan).
- `/packages/policy-engine/` exposes a typed `Policy.evaluate(subject, action, resource, context)` interface — no public contract, internal use only.

### 5.4 Reused contracts

- `tenant` (P05), `user` (P03), `role` / `permission` (P05), `deck` (P02), `deck_version` (P05).

### 5.5 Master-doc references

- **Security:** `/docs/07-security-planning.md` — add P20.5 verification matrix and pen-test report.
- **Architecture:** `/docs/04-system-architecture.md` — note the minimal `api-gw` introduced in P20.5.
- **Bangladesh legal:** `/docs/11-legal-compliance-bangladesh.md` — explicitly note P20.5 does **not** address PDPA and `bd-dhaka`; full P20 WS-X4 does.

### 5.6 Migration ordering

The 0025 migrations are forward-only Postgres migrations, split per concern (`0025_role_hierarchy.sql`, `0025_user_mfa.sql`, `0025_audit_event.sql`, `0025_rate_limit.sql`). Forward path is required; no downgrade scripts in P20.5.

---

## 6. Verification

### 6.1 Feature → test → expected result → owner

| Feature                  | Test                                           | Expected result                          | Owner               |
| ------------------------ | ---------------------------------------------- | ---------------------------------------- | ------------------- |
| #193b RBAC               | `editor` tries `DELETE /v1/decks/{id}`         | 403 + `policy.denied` audit              | Platform squad      |
| #193b Hierarchy          | `admin` can do all `editor` actions            | Verified via test matrix                 | Platform squad      |
| #193b ABAC brand-lock    | `editor` edits element in locked region        | Blocked; admin allowed                   | Platform squad      |
| #193b ABAC public share  | `editor` tries public share on restricted deck | `200` with `requiresAdminApproval: true` | Platform squad      |
| #193b Latency            | 10 K synthetic `policy.evaluate` calls         | p95 ≤ 5 ms                               | Platform squad      |
| #193c MFA                | `admin` first login                            | Forced TOTP enrollment                   | Auth squad          |
| #193c MFA bypass attempt | `admin` calls protected endpoint without MFA   | 403 + audit                              | Auth squad          |
| #196a Emit               | `POST /v1/decks` succeeds                      | `audit_event` row visible in same tx     | Platform squad      |
| #196a Query              | `GET /v1/admin/audit?action=deck.shared`       | Returns matching rows                    | Platform squad      |
| #196a Retention          | 91-day-old rows                                | Deleted by nightly job                   | Platform squad      |
| #196a Sensitive          | Login event metadata                           | No password hash or MFA secret           | Security + Platform |
| #195a CC regex           | Deck with `4111-1111-1111-1111`                | Share shows warning banner               | DLP squad           |
| #195a CC Luhn            | Deck with `4111-1111-1111-1112`                | No warning                               | DLP squad           |
| #195a Email              | Deck with `test@example.com`                   | Share shows warning                      | DLP squad           |
| #195a SSN                | Deck with `123-45-6789`                        | Share shows warning                      | DLP squad           |
| #195a Bypass             | User clicks "Share anyway"                     | `dlp.bypass_acknowledged` audit          | DLP squad           |
| #195a Export             | Export with email-shaped text                  | Warning banner                           | DLP squad           |
| New rate limit           | 11th login in 1 min                            | 429 + `Retry-After`                      | Platform squad      |
| New rate limit           | 6th signup in 1 hour                           | 429                                      | Platform squad      |
| New CAPTCHA              | Signup without CAPTCHA                         | Blocked                                  | Platform squad      |
| New anomaly              | Single IP, 10× burst in 60 s                   | P2 alert + audit                         | Platform squad      |
| New circuit breaker      | Tenant hits 50 % 5xx for 5 min                 | Throttled to 10 %; alert                 | Platform squad      |
| #7 gitleaks              | Commit with fake AWS key                       | CI fails                                 | Platform squad      |
| #7 Cookies               | `Set-Cookie` without `Secure`                  | Rejected by integration test             | Platform squad      |
| #7 CSRF                  | State-changing request without token           | 403                                      | Platform squad      |
| #7 CSP                   | Response missing `Content-Security-Policy`     | Rejected                                 | Platform squad      |
| #7 Hashing               | Argon2id cost                                  | ≥ 19 MiB verified                        | Auth squad          |
| #7 Session               | Reused refresh token                           | Entire chain invalidated                 | Auth squad          |
| New pen-test             | SAST + SCA + DAST + manual                     | 0 P0/P1                                  | Security lead       |

### 6.2 Compliance posture (P20.5 level)

P20.5 is **not SOC 2, GDPR, or PDPA compliant**. It is **safe enough for a public beta with designers and small teams**. The following are explicitly **not** provided by P20.5 and must be addressed by full P20 before any enterprise pilot / regulated industry sale:

- SOC 2 Type II audit
- GDPR DPA + sub-processor list
- Bangladesh PDPA compliance posture
- HIPAA / PCI DSS / FedRAMP alignment
- EU SCC adoption for cross-border transfers
- Reseller / partner agreements for regulated markets
- Code-signing certificate authority for plugins / components
- Pen-test by an external firm (P20.5 pen-test is internal)

### 6.3 Continuous security gate (P20.5 level)

Full P20 specifies three required rows in every other phase's verification matrix (`audit outbox`, `residency`, `DLP gating`). P20.5 specifies a subset that applies to beta:

- `[P-XX] emits audit event` — every state-changing action writes to `audit_event` via outbox.
- `[P-XX] consults policy engine` — every protected endpoint runs through `policy.evaluate`.
- `[P-XX] respects rate limits` — every new route is added to the rate-limit config with sensible defaults.

Residency and DLP-blocking are **not** applicable to P20.5 — they land in full P20.

---

## 7. Risks & open decisions

| ID             | Risk / decision                                                                                                                       | Mitigation                                                                                                                               | Owner               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| R-SEC-20.5-01  | **Audit log fill at beta scale.** If beta goes viral, `audit_event` table grows fast.                                                 | 90-day default retention is configurable per tenant; add partitioning by month if row count > 50 M. Migration script tested.             | Platform squad      |
| R-SEC-20.5-02  | **DLP false positives annoy users.** Email regex catches everything that looks like an email; users click "Share anyway" reflexively. | Track `dlp.bypass_acknowledged` rate; if > 30 % of shares bypass, refine the rule before adding more. Soft warnings only — never blocks. | DLP squad           |
| R-SEC-20.5-03  | **Rate-limit false positives.** Aggressive limits on `/signup` may block legitimate users behind NAT or corporate proxies.            | Per-IP + per-subnet limits; CAPTCHA fallback before 429; manual review queue for blocked signups.                                        | Platform squad      |
| R-SEC-20.5-04  | **MFA enrollment friction.** Forcing MFA on `admin`/`owner` may surprise new users in beta.                                           | Clear onboarding flow; recovery codes; 7-day grace period for invited users before enforcement.                                          | Auth + Product      |
| R-SEC-20.5-05  | **Argon2id migration risk.** If legacy hashes exist, the migration script must not lock users out.                                    | Dual-hash verification: next login re-hashes with Argon2id if legacy; if migration fails, fall back to legacy and audit.                 | Auth squad          |
| R-SEC-20.5-06  | **Self-pen-test scope.** Internal SAST/SCA/DAST may miss business-logic flaws.                                                        | Supplement with manual review of the top-10 OWASP categories; supplement later with external pen-test in full P20.                       | Security lead       |
| R-SEC-20.5-07  | **Policy engine bypass.** A new endpoint added without middleware is a hole.                                                          | Forbidden-bypass detection logs every request to a protected endpoint; CI test enumerates all routes and verifies each is wrapped.       | Platform squad      |
| R-SEC-20.5-08  | **Beta vs. enterprise framing.** Beta users may assume enterprise features (SSO, audit export) and be disappointed.                   | Public beta landing page and `/admin` docs explicitly describe what is and isn't included.                                               | Product + Marketing |
| OD-SEC-20.5-01 | **Argon2id cost parameter.** Default 19 MiB is conservative; higher is more secure but slower.                                        | Resolve in P20.5 with Security lead; document the choice.                                                                                | Security lead       |
| OD-SEC-20.5-02 | **Audit retention default 90 days.** Beta may want longer or shorter.                                                                 | Default 90; configurable per tenant; doc the override.                                                                                   | Product + Security  |
| OD-SEC-20.5-03 | **Rate-limit numbers.** Defaults chosen for safety; may need tuning per beta cohort.                                                  | All limits env-configurable; ship safe defaults; tune per telemetry after 1 week.                                                        | Platform squad      |

---

## 8. Demo

A single 30-minute internal demo that proves the three rungs are met. Run in staging with a fresh DB and a representative dataset (1 K decks, 100 users, 10 K audit events).

### 8.1 Setup (3 min)

- Open `https://admin.staging.domio.app` as `security-lead@staging`.
- Open `https://editor.staging.domio.app` as `alice@staging` (admin) and `bob@staging` (editor).
- Confirm gitleaks + SAST + SCA + DAST dashboard is green.

### 8.2 RBAC + ABAC (8 min) — Locked rung

1. As Bob (`editor`), try to delete a deck he does not own. Show 403.
2. Show the audit event: `policy.denied` with `actor=bob`, `action=deck.delete`, `reason=role_insufficient`.
3. As Alice (`admin`), perform the same delete. Show 200.
4. Show the brand-locked region: Bob edits an element in a locked region → blocked. Alice edits the same → allowed.
5. As Alice, force TOTP enrollment by demoting then re-promoting a user to `admin`. Show the forced enrollment screen.

### 8.3 Audit log (5 min) — Beta-ready rung

1. In the admin audit page, filter by `actor=alice`, `action=deck.edited`, `last 24 hours`. Show the events.
2. Show that a delete attempt by Bob produced both a `policy.denied` and a follow-up `audit_event` (single tx).
3. Export to CSV; open in editor; verify schema.
4. Manually insert a 91-day-old row (via SQL); show the nightly job deletes it.

### 8.4 DLP warnings (5 min) — Beta-ready rung

1. As Alice, create a deck with a slide containing `Credit card: 4111-1111-1111-1111`.
2. Click Share; show the warning banner with the matched rule.
3. Click "Share anyway"; show the `dlp.bypass_acknowledged` audit event.
4. Repeat with email and SSN text.
5. Try invalid `4111-1111-1111-1112` (fails Luhn); show no warning.

### 8.5 Rate limiting (5 min) — Beta-ready rung

1. From a load-test script, fire 11 logins from the same IP in 60 seconds. Show the 11th returns 429 with `Retry-After`.
2. Fire 6 signups in an hour. Show 6th returns 429.
3. Trigger the anomaly alert by firing 10× 429s in 60 seconds. Show the P2 alert in PagerDuty.
4. Trigger the tenant circuit breaker by inducing 50 % 5xx rate for 5 minutes. Show the throttle and alert.

### 8.6 Secrets posture (3 min) — Locked rung

1. Show gitleaks output: 0 findings.
2. Show CSP header on every web response.
3. Show `Set-Cookie` headers all `Secure` + `HttpOnly` + `SameSite=Lax`.
4. Show CSRF rejection on a malformed request.

### 8.7 Wrap-up (1 min) — Rung summary

- Confirm Locked, Beta-ready, and Public beta rows are all green.
- Hand off the demo recording to Security lead for sign-off.

---

## 9. Definition of Done

- [ ] **Code merged.** All 5 packages + 4 contracts + 4 migration files merged to `main`; CI gates green (lint, type, unit, contract, SAST, SCA, DAST, secret scan).
- [ ] **Contracts versioned.** New OpenAPI files checked in under `/contracts/` with explicit version numbers.
- [ ] **Tests pass.** Unit, integration, and contract tests pass; performance target p95 ≤ 5 ms for `policy.evaluate` verified; load test for rate limits passes.
- [ ] **Telemetry in place.** RED metrics for `policy.evaluate`, `audit_event` write rate, `dlp-warn` match rate, rate-limit hit rate. P2 alerts for rate-limit anomalies and tenant circuit breakers.
- [ ] **Docs updated.** `/docs/07-security-planning.md` updated with P20.5 verification matrix and pen-test report; this phase listed in `phase-graph.md` between P05 and P14; `README.md` index entry added.
- [ ] **Self-pen-test passed.** SAST + SCA + DAST + manual OWASP top-10 review show 0 P0/P1; report attached.
- [ ] **Rung demo passed.** Internal demo for Locked (B1 + B5), Beta-ready (+ B2 + B3 + B4), and Public beta (+ B6) recorded and reviewed by Security lead.
- [ ] **Beta launch signed off.** Security lead + Founders approve public beta opening.

---

## 10. Relationship to full P20

P20.5 is the **beta-only cut** of P20. When the team is ready to start enterprise pilots (target: post-PMF), the following mapping kicks in:

| P20.5 workstream                       | Full P20 replacement                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| B1 (policy engine, RBAC + scoped ABAC) | P20 WS-X5 (full RBAC + ABAC + policy engine with WASM CEL)                    |
| B2 (lightweight audit log)             | P20 WS-X2 (hash-chained audit, ClickHouse, WORM bucket, 7-year retention)     |
| B3 (soft DLP warnings)                 | P20 WS-X3 (full DLP engine, rule packs, ML classifier, hard `block` severity) |
| B4 (rate limiting)                     | P20 WS-X7 (ti­ered rate limits, OAuth 2.1, idempotency keys)                  |
| B5 (secrets posture)                   | Absorbed into P20 (no replacement — already scoped)                           |
| B6 (self-pen-test)                     | P20 §6.2 (full compliance drill + external pen-test)                          |
| (none in P20.5)                        | P20 WS-X1 (SSO/SCIM) — added in full P20                                      |
| (none in P20.5)                        | P20 WS-X4 (residency, retention, legal hold, `bd-dhaka`) — added in full P20  |
| (none in P20.5)                        | P20 WS-X6 (brand governance) — added in full P20                              |
| (none in P20.5)                        | P20 WS-X8 (webhooks) — added in full P20                                      |
| (none in P20.5)                        | P20 WS-X9 (seat analytics) — added in full P20                                |
| (none in P20.5)                        | P20 WS-X10 (plugin runtime + component SDK) — added in full P20               |
| (none in P20.5)                        | P20 WS-X11 (headless renderer) — added in full P20                            |

P20.5 has **no non-engineering blockers**. None of B1–B6 require Bangladeshi counsel, sub-processor DPAs, SCC adoption, AGPL stance, or code-signing CAs. All of those are kicked to full P20 and are explicitly out of scope for beta.

---

_End of phase-20.5-beta-security-hardening.md._
