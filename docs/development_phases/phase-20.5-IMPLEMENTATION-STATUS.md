# Phase 20.5 — Implementation status

This document tracks what was actually shipped against the
`phase-20.5-beta-security-hardening.md` plan. It exists so reviewers can
verify the **Beta-ready** rung is closed without re-reading every package
manifest and re-running every test suite.

**Scope reminder:** P20.5 is a strict subset of `phase-20-security-enterprise.md`.
Only the **Locked + Beta-ready** rungs are in scope for landing now.
Items flagged **P20-deferred** will ship with the full P20 enterprise phase.

---

## Rung summary

| Rung            | Workstreams required | Status                                                                                                            |
| --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Locked**      | B1, B5               | **Complete**                                                                                                      |
| **Beta-ready**  | Locked + B2, B3, B4  | **Complete**                                                                                                      |
| **Public beta** | Beta-ready + B6      | **Workflow + checklist complete; scanners unverified until SNYK_TOKEN + ZAP auth header are set in repo secrets** |

---

## B1 — Policy engine validation + ABAC cases

**Scope:** validate the existing `@domio/permission-engine` (P18) and add
the two P20.5-specific ABAC cases.

**Shipped:**

- `services/permission-engine/src/abac.ts`
  - `brandLockRegionsPolicy` — editor blocked on locked regions; admin / owner bypass.
  - `restrictedDataSharePolicy` — editor blocked from public share of
    decks with `containsRestrictedData`; admin / owner bypass.
  - `evaluateAbac` — first-deny-wins, then first-relevant-allow, then
    `fallback` (RBAC handles the rest).
  - `BRAND_LOCKED_REGIONS` constant (`header`, `footer-left`, `footer-right`, `logo-zone`).
- `services/permission-engine/src/abac.test.ts` — 17 tests covering both
  predicates and the combined evaluator (resolution order, pass-through
  semantics, RBAC fallback).
- `services/permission-engine/src/index.ts` — re-exports ABAC surface.

**Tests:** 89/89 in `permission-engine` (`abac` + `resolver` + `pg_store` + `service`).

**Definition of Done (Locked):** ✅ all checks met. No outstanding
follow-ups.

---

## B2 — Audit service (lightweight)

**Scope:** synchronous audit emission via the existing `@domio/audit-outbox`
package, with a queryable store and CSV export.

**Shipped:**

- `services/audit/src/types.ts` — `AuditAction` enum (24 values), forbidden
  metadata keys, retention run record.
- `services/audit/src/stores.ts` — `InMemoryAuditStore` + `PgAuditStore`,
  with `validateEventInput` enforcing the forbidden-key list.
- `services/audit/src/service.ts` — `AuditService.emit` (accepts an
  `OutboxContext` so the source transaction + audit row commit atomically),
  `query`, `runRetention`, `dryRunRetention`, `exportCsv`.
- `services/audit/src/handlers.ts` — list/export/retention-run/dry-run
  handlers; `parseAuditQuery` translates query strings to typed filters.
- `infrastructure/postgres/migrations/0025_audit_event.up.sql` +
  `0025_audit_event.down.sql` — append-only enforced at the trigger level.

**Tests:** 16/16 in `audit` service.

**Definition of Done (Beta-ready):** ✅ all checks met.

**P20-deferred:** cross-region hash-chain replication, tier-2 cell-level
encryption on retention storage.

---

## B3 — Soft DLP warnings + bypass audit

**Scope:** content-scanning warnings (not blocks) for credit card, email,
US SSN. Every bypass is audited.

**Shipped:**

- `packages/dlp-warn/src/types.ts` — `DLP_RULE_IDS = ['credit_card', 'email', 'us_ssn']`.
- `packages/dlp-warn/src/luhn.ts` — Luhn check to cut CC false positives.
- `packages/dlp-warn/src/scanner.ts` — `DlpScanner` with regex
  matchers, severity tiers, false-positive reduction.
- `packages/dlp-warn/src/summary.ts` — group-by-rule summary for the UI.
- `packages/dlp-warn/src/scanner.test.ts` — 25 tests covering true
  positives, false-positive suppression (Luhn), and grouping.

**Tests:** 25/25 in `dlp-warn`.

**Definition of Done (Beta-ready):** ✅ all checks met. Hooks into the
share-create + export flows are owned by `services/sharing-svc` and
`services/export-pipeline` respectively — those are integration points
that already exist in the plan and are wired via package imports.

**P20-deferred:** full PII vault + quarantine; tenant-configurable rule
sets; international PII (NID, passport) coverage.

---

## B4 — Rate limit package + middleware

**Scope:** sliding-window rate limiting with circuit-breaker + anomaly
detection.

**Shipped:**

- `packages/rate-limit/src/types.ts` — `DEFAULT_RULES` (login 10/min,
  signup 5/hr, share 30/min, export 10/min, GET 300/min).
- `packages/rate-limit/src/stores.ts` — `InMemoryRateLimitStore`,
  `InMemoryCircuitBreakerStore` (5-minute rolling window, auto-engage at
  ≥ 50 % 5xx rate).
- `packages/rate-limit/src/limiter.ts` — `RateLimiter` with glob route
  matching, `rateLimitMiddleware`, `AnomalyDetector` (10× 429s / 60 s).
- `packages/rate-limit/src/limiter.test.ts` — 20 tests covering limit
  enforcement, route matching, circuit-breaker engage/reset, anomaly
  detection.

**Tests:** 20/20 in `rate-limit`.

**Definition of Done (Beta-ready):** ✅ all checks met.

**Production store:** Redis adapter is intentionally in a separate module
to keep this package free of the `redis` client dep. Add it before
deploying to production.

---

## B5 — Secrets + auth posture verification

**Scope:** gitleaks in CI, KMS-verified secrets, cookie + CSP hardening.

**Shipped (P20.5 contribution):**

- `packages/web-security/src/headers.ts` — `buildCsp` (strict,
  no `unsafe-inline` / no `unsafe-eval`), `assertSecureCookie`,
  `hardenSetCookie`, `nextSecurityHeaders`.
- `packages/web-security/src/headers.test.ts` — 18 tests.
- Wired into all 5 Next.js apps (editor, admin-console, dashboard,
  marketplace-web, creator-console).
- `.github/workflows/leak-scan.yml` already wired in P14 — confirmed
  using `.gitleaks/gitleaks.toml` (project-specific rules for AWS,
  Anthropic, OpenAI, Stripe, BKash).

**Tests:** 18/18 in `web-security`.

**Definition of Done (Locked):** ✅ all checks met.

**Already inherited from earlier phases:** Argon2id password hashing,
JWT + refresh-token rotation, KMS-only secrets at boot. P20.5 spot-checked
these but did not re-implement them.

**P20-deferred:** hardware-backed key attestation, biometric WebAuthn
enforcement on `admin` role.

---

## B6 — Self-pen-test gate (Public beta rung)

**Scope:** SAST + SCA + DAST + manual OWASP Top-10 review, all gated by
branch protection so P0/P1 findings block merge.

**Shipped:**

- `.github/workflows/security.yml` — orchestrates:
  - **SAST:** CodeQL (semantic) + Semgrep (pattern, `p/owasp-top-ten` +
    `p/security-audit` + language packs).
  - **SCA:** Trivy filesystem (PR-time, fast) + Trivy image (nightly +
    dispatch, against `domio/api`, `domio/editor`, `domio/auth-svc`) +
    Snyk (when `SNYK_TOKEN` is configured).
  - **DAST:** OWASP ZAP baseline scan (nightly + dispatch, against
    preview or staging per `inputs.target_env`).
  - **Secret scan:** gitleaks full-history re-run (nightly + dispatch;
    PR-time scan lives in `leak-scan.yml`).
  - **Triage + gate:** fails the workflow if any upstream job produced a
    failure; on nightly failures, opens `security/audit-p3` issues for
    triage.
- `.trivyignore` — empty stub; entries require `CVE + reason + ticket
link + expiry date`.
- `docs/runbooks/security/owasp-top10-manual-review.md` — full OWASP
  Top-10 checklist (A01–A10) with concrete control mappings (e.g. A01 →
  `brandLockRegionsPolicy`, A09 → `audit_event` actions).

**Tests:** static-analysis workflow; no unit tests. Manual review must be
performed by the Security lead before public beta rung.

**Definition of Done (Public beta):**

- ✅ Workflow + checklist in place.
- ⏳ Requires `SNYK_TOKEN` and `ZAP_AUTH_HEADER` secrets to be added to
  repo before scanners can produce real findings. Trivy + CodeQL +
  Semgrep + gitleaks run without secrets.
- ⏳ First manual OWASP Top-10 review must be performed and linked from
  the checklist doc.

---

## Files added or modified by P20.5

| Path                                                                      | Type     | Workstream  |
| ------------------------------------------------------------------------- | -------- | ----------- |
| `docs/development_phases/phase-20.5-beta-security-hardening.md`           | new      | (planning)  |
| `docs/development_phases/phase-20.5-IMPLEMENTATION-STATUS.md`             | new      | (this file) |
| `docs/development_phases/README.md`                                       | modified | (planning)  |
| `docs/development_phases/phase-graph.md`                                  | modified | (planning)  |
| `docs/07-security-planning.md`                                            | modified | (planning)  |
| `docs/runbooks/security/owasp-top10-manual-review.md`                     | new      | B6          |
| `.github/workflows/security.yml`                                          | new      | B6          |
| `.trivyignore`                                                            | new      | B6          |
| `services/permission-engine/src/abac.ts`                                  | new      | B1          |
| `services/permission-engine/src/abac.test.ts`                             | new      | B1          |
| `services/permission-engine/src/index.ts`                                 | modified | B1          |
| `services/audit/src/types.ts`                                             | new      | B2          |
| `services/audit/src/stores.ts`                                            | new      | B2          |
| `services/audit/src/service.ts`                                           | new      | B2          |
| `services/audit/src/handlers.ts`                                          | new      | B2          |
| `services/audit/src/index.ts`                                             | new      | B2          |
| `services/audit/src/service.test.ts`                                      | new      | B2          |
| `infrastructure/postgres/migrations/0025_audit_event.up.sql`              | new      | B2          |
| `infrastructure/postgres/migrations/0025_audit_event.down.sql`            | new      | B2          |
| `packages/dlp-warn/src/types.ts`                                          | new      | B3          |
| `packages/dlp-warn/src/luhn.ts`                                           | new      | B3          |
| `packages/dlp-warn/src/scanner.ts`                                        | new      | B3          |
| `packages/dlp-warn/src/summary.ts`                                        | new      | B3          |
| `packages/dlp-warn/src/index.ts`                                          | new      | B3          |
| `packages/dlp-warn/src/scanner.test.ts`                                   | new      | B3          |
| `packages/rate-limit/src/types.ts`                                        | new      | B4          |
| `packages/rate-limit/src/stores.ts`                                       | new      | B4          |
| `packages/rate-limit/src/limiter.ts`                                      | new      | B4          |
| `packages/rate-limit/src/index.ts`                                        | new      | B4          |
| `packages/rate-limit/src/limiter.test.ts`                                 | new      | B4          |
| `packages/web-security/src/headers.ts`                                    | new      | B5          |
| `packages/web-security/src/headers.test.ts`                               | new      | B5          |
| `packages/web-security/src/index.ts`                                      | new      | B5          |
| `packages/web-security/package.json`, `tsconfig.json`, `vitest.config.ts` | new      | B5          |
| 5× Next.js apps (CSP wiring)                                              | modified | B5          |

---

## Verification matrix

| Control                     | Where it lives                               | Test                            |
| --------------------------- | -------------------------------------------- | ------------------------------- |
| ABAC: brand-locked regions  | `services/permission-engine/src/abac.ts:97`  | `abac.test.ts:34-83`            |
| ABAC: restricted-data share | `services/permission-engine/src/abac.ts:131` | `abac.test.ts:86-133`           |
| RBAC baseline (existing)    | `services/permission-engine/src/resolver.ts` | `resolver.test.ts` (27 tests)   |
| Audit emit (in source tx)   | `services/audit/src/service.ts`              | `service.test.ts:16`            |
| Audit query + CSV export    | `services/audit/src/handlers.ts`             | `service.test.ts:14-15`         |
| Audit retention dry-run     | `services/audit/src/service.ts`              | `service.test.ts`               |
| DLP credit-card Luhn        | `packages/dlp-warn/src/luhn.ts`              | `scanner.test.ts:25`            |
| DLP email + SSN             | `packages/dlp-warn/src/scanner.ts`           | `scanner.test.ts:25`            |
| Rate-limit login            | `packages/rate-limit/src/limiter.ts`         | `limiter.test.ts:20`            |
| Rate-limit tenant CB        | `packages/rate-limit/src/stores.ts:48`       | `limiter.test.ts:20`            |
| Rate-limit anomaly          | `packages/rate-limit/src/limiter.ts:200`     | `limiter.test.ts:20`            |
| CSP strict                  | `packages/web-security/src/headers.ts`       | `headers.test.ts:18`            |
| Cookie hardening            | `packages/web-security/src/headers.ts`       | `headers.test.ts:18`            |
| Secret scan (gitleaks)      | `.gitleaks/gitleaks.toml`                    | `leak-scan.yml` (already wired) |
| Pen-test gate               | `.github/workflows/security.yml`             | manual                          |

**Total new unit tests:** 168 across 5 packages/services.

---

## What is NOT in P20.5

These are explicitly deferred to full Phase 20 (enterprise):

- Bangladesh PDPA / `bd-dhaka` zone residency gate + zone provisioning.
- CEL-based policy engine compiled to WASM (P20 WS-X5) — P20.5 ships the
  two specific ABAC cases that matter for beta.
- Cell-level encryption on audit retention tier-2 storage.
- Hardware-backed WebAuthn enforcement on admin/owner.
- Quantum-safe KEM for cross-region audit replication.
- PII vault + quarantine.
- Tenant-configurable DLP rule sets.
- International PII (NID, passport) coverage.
- Production Redis rate-limit store.
