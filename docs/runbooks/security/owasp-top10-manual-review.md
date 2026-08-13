# OWASP Top-10 manual review checklist (Phase 20.5 WS-B6 / T-B6.4)

This is the engineer-driven walkthrough for the **self-pen-test gate** (B6).
Scanners (CodeQL, Semgrep, Snyk, Trivy, OWASP ZAP) catch most things
automatically — this checklist covers the gaps scanners are blind to and
forces the reviewer to put eyes on every category once per release.

**Owner:** Security lead on rotation (see `.github/CODEOWNERS`).
**Cadence:** once per public-beta rung, after a clean SAST+SCA+DAST run.

## How to use

1. Open a new issue: `security/owasp-review-yyyy-mm-dd`.
2. Walk every row top to bottom. Don't skip — the goal is _no unchecked
   rows_, not "no findings".
3. For each row, link the code paths, tickets, or test IDs that prove the
   control exists.
4. If you find a P0/P1, file a fix PR and re-run `security.yml` before the
   next release rung.
5. When the issue is closed, paste a summary back into this file's
   [Last completed review](#last-completed-review) section.

---

## A01 — Broken Access Control

- [ ] **IDOR check.** Every `GET /v1/resource/:id` and `DELETE /v1/resource/:id`
      verifies the caller has a grant for _that_ resource (not just the
      resource kind). Walk a tenant A trying to read tenant B's ids.
- [ ] **Workspace role escalation.** Editor cannot promote themselves to
      admin by editing their own membership row. Test in `permission-engine`.
- [ ] **Folder / project inheritance.** A removed folder grant does not
      re-open access via the deck path. `service.test.ts` covers this.
- [ ] **Public share bypass.** A `public` share scope never grants editor
      rights to the source workspace. `restrictedDataSharePolicy` covers this.
- [ ] **Brand-locked region ABAC.** `brandLockRegionsPolicy` denies editor
      edits on locked regions. `abac.test.ts` covers this.

## A02 — Cryptographic Failures

- [ ] **Password hashing.** Argon2id with cost ≥ 19 MiB. Legacy bcrypt
      migrated on next login.
- [ ] **TLS 1.3 enforced.** `Strict-Transport-Security` on every web
      response. `nextSecurityHeaders()` covers this.
- [ ] **Cookies hardened.** `Secure`, `HttpOnly`, `SameSite=Lax` on every
      Set-Cookie. `assertSecureCookie()` rejects anything missing them.
- [ ] **Refresh tokens at rest.** Hashed with SHA-256 + workspace salt before
      storing in `auth_refresh_token`. Reuse detection invalidates the chain
      (RFC 6819 §5.2.2.3).
- [ ] **JWT signing keys.** Rotated quarterly via KMS; `kid` header honored
      by the verifier.

## A03 — Injection

- [ ] **SQL injection.** All queries use parameterized statements or the
      ORM. No `pg` `query` with string interpolation.
- [ ] **NoSQL injection.** Mongo-style inputs (request bodies with `$gt`,
      `$ne`) are stripped or rejected by the API gateway.
- [ ] **OS command injection.** Worker commands run via `execa` (argv, never
      shell). No `child_process.exec` on user input.
- [ ] **Template injection.** Email templates use a sandboxed renderer with
      no `eval`/Function constructor.

## A04 — Insecure Design

- [ ] **Threat model updated.** `docs/07-security-planning.md` §3 reflects
      the current architecture. New surfaces have a STRIDE row.
- [ ] **Rate limiting on auth.** Login: 10 / min / IP. Signup: 5 / hr / IP.
      `rate-limit` package enforces both.
- [ ] **Tenant circuit breaker.** A tenant with > 50 % 5xx rate over 5
      minutes engages the breaker (throttle factor 0.1).
- [ ] **Bypass auditing.** Every DLP warning dismissed by the user is
      captured in `audit_event` with action `dlp.bypass`.

## A05 — Security Misconfiguration

- [ ] **No defaults in prod.** All `*.example` env vars replaced by KMS
      values at boot. No `dev` flags shipped.
- [ ] **CORS restricted.** Allowlist is workspace-scoped, never `*`.
- [ ] **CSP strict.** `default-src 'self'`, no `unsafe-inline`, no
      `unsafe-eval`. Asset domains explicitly allowlisted in
      `buildCsp()`.
- [ ] **Frame-ancestors none.** No third-party iframe embedding.
- [ ] **Permissions-Policy header.** Disables unused browser features
      (camera, geolocation, etc.) by default.
- [ ] **Cloud metadata service blocked.** Workers run with
      `169.254.169.254` denied in iptables.

## A06 — Vulnerable & Outdated Components

- [ ] **`pnpm audit` clean** for severity ≥ high (with documented
      exceptions in `.trivyignore`).
- [ ] **Container images patched.** Trivy image scan returns 0 CRITICAL.
      Renovate keeps base images up to date (`.github/renovate.json`).
- [ ] **No unmaintained deps.** `pnpm ls --depth=0` shows no `deprecated`
      packages.
- [ ] **CVE feed watched.** Dependabot + Renovate wired; alerts routed to
      `#sec-alerts`.

## A07 — Identification & Authentication Failures

- [ ] **MFA available.** TOTP + WebAuthn available; enforced on `admin`
      and `owner` roles.
- [ ] **No password hints stored.** Login flows never surface a "your
      password hint was X" response.
- [ ] **Session lifetime.** 15-minute access tokens, 7-day refresh with
      rotation. Reuse detection tested.
- [ ] **Brute force.** Lockout + CAPTCHA after 10 failed logins in 1 minute
      on the same IP. `rate-limit` package covers this.

## A08 — Software & Data Integrity Failures

- [ ] **Signed releases.** Container images signed with cosign; admission
      controller verifies the signature.
- [ ] **Provenance attestation.** `build-provenance.yml` produces an
      in-toto SLSA L3 attestation. Verified at deploy.
- [ ] **Outbox integrity.** Audit emission is in the same transaction as
      the source mutation. `audit_outbox` package enforces this.
- [ ] **Hash chain on audit log.** Every `audit_event` row chains to the
      previous event's hash (`@domio/audit-ts`).

## A09 — Security Logging & Monitoring Failures

- [ ] **Auth events audited.** login, logout, MFA enrolment, password
      change, session revoke — all in `audit_event`.
- [ ] **Admin actions audited.** Role change, grant revoke, share creation,
      export, retention run — all in `audit_event`.
- [ ] **DLP bypasses audited.** `dlp.bypass` event with rule id + snippet
      hash.
- [ ] **429s audited.** Every rate-limit 429 emits a `rate_limit.exceeded`
      event.
- [ ] **Alerts wired.** Anomaly detector (10× 429s / 60s) pages the on-call
      via PagerDuty.
- [ ] **Retention run.** 13-month retention enforced; `dryRunRetention()`
      previewed before any deletion.

## A10 — Server-Side Request Forgery (SSRF)

- [ ] **Outbound URL validator.** Image proxy / webhook receiver rejects
      private IP ranges (RFC 1918, link-local, loopback).
- [ ] **DNS rebinding mitigation.** Resolved IP pinned for the lifetime of
      the request.
- [ ] **Cloud metadata blocked.** Same control as A05.

---

## Out of scope for beta

These land in **Phase 20** proper (not P20.5):

- Bangladesh PDPA / `bd-dhaka` zone residency gate.
- Cell-level encryption for audit retention tier-2 storage.
- Quantum-safe KEM for cross-region audit log replication.

---

## Last completed review

| Date  | Reviewer        | Result | Issue link |
| ----- | --------------- | ------ | ---------- |
| _TBD_ | _Security lead_ | _TBD_  | _TBD_      |
