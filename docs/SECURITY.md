# Domio — Security

> **Source of truth:** `threat-model/`, `services/permission-engine/`,
> `services/audit/`, `packages/{web-security, rate-limit, dlp-warn,
> redact-pii, signed-link-token, audit-ts}/`, `.github/workflows/security.yml`,
> `.github/workflows/leak-scan.yml`, `.gitleaks/gitleaks.toml`. **Last regenerated:** 2026-08-16.

## 1. Threat model

- `threat-model/00-process.md` — process for updating the threat model
- `threat-model/01-definitions.md` — terms
- `threat-model/components/` — per-component threat models
  (realtime-gateway, editor, control-plane, …)
- `threat-model/__tests__/` — threat-model tests

## 2. Authentication & authorization

- **RBAC + ABAC** in `services/permission-engine/`
  - RBAC baseline (`resolver.ts`)
  - ABAC predicates: `brandLockRegionsPolicy`,
    `restrictedDataSharePolicy` (`abac.ts`)
  - 89 tests in `permission-engine`
- **Auth** — JWT + refresh-token rotation, KMS-only secrets at boot,
  Argon2id password hashing
- **Brand-locked regions** (ADR-0008) — header, footer-left,
  footer-right, logo-zone; agents and juniors blocked by default

## 3. Audit

- `services/audit/` — append-only audit log; PostgreSQL trigger-enforced
- `AuditAction` enum (24 values), forbidden metadata keys, retention
  run + dry-run, CSV export
- 16 unit tests in `audit`

## 4. DLP

- `packages/dlp-warn/` — soft-DLP scanner for credit cards, emails, US SSN
- Luhn check on credit cards
- 25 unit tests

## 5. Rate limiting

- `packages/rate-limit/` — sliding-window rate limiter + circuit breaker +
  anomaly detector
- Defaults: login 10/min, signup 5/hr, share 30/min, export 10/min, GET 300/min
- 5-minute rolling window; auto-engage CB at ≥50% 5xx rate
- 20 unit tests
- Production Redis adapter is intentionally a separate module

## 6. Web security

- `packages/web-security/` — strict CSP (`buildCsp`), secure cookie
  hardening, Next.js `nextSecurityHeaders` middleware
- 18 unit tests
- Wired into all 5 Next.js apps

## 7. Secret scanning

- `.gitleaks/gitleaks.toml` — project-specific rules
- `.github/workflows/leak-scan.yml` — gitleaks PR + push scan
- Bangladesh-specific patterns covered (BKash, Nagad, Rocket) plus AWS,
  Anthropic, OpenAI, Stripe, GCP, Datadog

## 8. CI security stack (`.github/workflows/security.yml`)

- **SAST:** CodeQL + Semgrep (`p/owasp-top-ten`, `p/security-audit`)
- **SCA:** Trivy filesystem (PR), Trivy image (nightly + dispatch),
  Snyk (when `SNYK_TOKEN` is configured)
- **DAST:** OWASP ZAP baseline scan (nightly + dispatch)
- **Triage + gate:** fails the workflow if any upstream job produced a
  failure; nightly failures open `security/audit-p3` issues for triage

## 9. SBOM

- `sbom/` — generated SBOMs

## 10. PII redaction

- `packages/redact-pii/` — at ingest
- Privacy modes: identified / pseudonymous / anonymous-consent /
  anonymous-no-track (per-viewer)

## 11. Compliance binders

- SOC 2 evidence binder (`docs/runbooks/security/owasp-top10-manual-review.md`)
- PDPA / GDPR binder — author from the threat-model + audit + DLP
  controls
- Bangladesh-specific compliance owned by the security lead

## 12. ADR cross-refs

- ADR-0007 — License JWTs with 30-day offline grace
- ADR-0008 — Brand-lock region model