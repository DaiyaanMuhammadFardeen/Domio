# 07 — Security Planning

> **Status:** Authoritative for threat model, controls, secure SDLC, and pen-test cadence. Bangladesh-specific overlays live in `11`; enterprise/SSO/SCIM/DLP details live in `enterprise-governance.md`.
> **Assumptions:**
> - **Tenant isolation** is non-negotiable; cross-tenant operations require elevated roles and dual-control.
> - **Defense in depth:** WAF, TLS 1.3, mTLS (SPIFFE) internal, Postgres RLS, capability-based plugin sandbox, audit-by-default.
> - **Prompt injection** is a first-class threat; AI orchestration includes input filtering, output validation, and tool-call allowlists.
> - **PII minimization:** logs and metrics never carry raw PII; structured fields are allowlisted.
> - **Secure by default:** MFA, passkeys, audit-on-privilege, content DLP pre-share are defaults; opt-out only where justified.
> - **SBOM** generated and archived per release; AGPL avoidance per `11.7` of planning guide.
> - **Pen test:** annual external + quarterly internal; bug bounty with 48h triage SLA for P0/P1.
> **Owner:** Security lead.
> **Last reviewed:** 2026-07-29.

---

> **Purpose:** specify the threat model, controls, threat-to-control matrix, secure SDLC, and verification for the collaborative deck editor platform.
> **Posture:** defense in depth, tenant isolation by default, prompt-injection awareness, and a secure-by-default config that is *opt-out* for high-trust enterprise cases.
> **Cross-references:** `01` (personas), `02` (NFRs), `04` (architecture), `05` (RLS, PII), `06` (stack), `11` (legal), `12` (BD context).

---

## 7.0 Security Principles

1. **Tenant isolation is non-negotiable.** Every cross-tenant operation requires an explicit elevated role and dual-control.
2. **Zero trust on user content.** Documents, data, and AI output are untrusted input to any other context.
3. **No implicit trust in plugins, AI agents, code blocks, or embeds.** Every capability is granted explicitly.
4. **Prompt-injection is a first-class threat.** Any content routed to an LLM is filtered and constrained.
5. **Audit by default.** Every privileged action is logged immutably.
6. **Secure by default; opt-out only where justified.** Enterprise features (passkeys, MFA) are on by default.
7. **Least-privilege everywhere.** Worker credentials, agent keys, and user sessions are scoped and short-lived.
8. **PII minimization.** Logs and metrics never carry raw PII; structured fields are allowlisted.

---

## 7.1 Threat Model (STRIDE per surface)

We model threats per surface and across integrations. STRIDE = Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.

### 7.1.1 Identity & authentication

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Credential stuffing | S | Attacker brute-forces passwords | MFA enforcement; passkeys; rate limit; breach-list checks |
| Session theft | S/I | Cookie theft via XSS or malware | HttpOnly+Secure cookies; SameSite=Lax; CSP; passkeys |
| IdP compromise | S/E | Attacker controls the SSO IdP | IdP-configured policies; admin MFA; break-glass accounts |
| SCIM spoofing | S | Fake provisioning | SCIM token + IP allowlist; HMAC signing |
| Session fixation | S | Attacker plants session | Rotate session id on auth |

### 7.1.2 Collaboration & CRDT

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| CRDT flood | D | Malicious ops fill the log | per-deck rate; tenant quota; revoke write token |
| CRDT injection | T/I | Malicious CRDT update causes UI or behavior change | schema validation of materialization; reject malformed ops |
| Element-level tampering | T | Forged authority over another user's edit | per-element Lamport + signed actor IDs |
| Forking bait | T | Forged branch with poisoned content | branch owner required; brand-locked content cannot be modified in branches |
| Cursor tracking | I | Presence reveals user location/behavior | presence opt-out; ephemeral TTL; per-tenant disable |
| Comment XSS | T/I | HTML in comments executes | Markdown only; sanitizer; CSP |

### 7.1.3 Data sources & live data

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Source credential leak | I | Raw creds exposed to clients | credentials in Vault; viewer never receives creds; signed snapshot URLs |
| SSRF via connector | I | Server fetches attacker-chosen URLs | URL allowlist per source; outbound egress restricted; DNS pinning |
| Data poisoning | T | Compromised source returns poisoned values | provenance chips; freshness thresholds; anomaly detection |
| Connector overflow | D | Source overwhelms worker | per-source concurrency; queue caps |
| Write-back abuse | T/I | Agent writes back to source (#48 extension) | agent scope requires explicit write grant; change log returned |

### 7.1.4 AI & agentic surface

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Prompt injection (docs) | T/I/E | Slide content or doc manipulates the AI | system-prompt separation; injection classifier; tool-call validation; no free-form tool use on untrusted input |
| Prompt injection (data) | T/I | Chart data carries instructions | data rendered as values only; no instructions in tool args |
| Tool abuse | E | Agent invokes unintended tools | tool allowlist per agent key; dry-run default; revocation |
| MCP context leak | I | Tool call responses leak secrets | redactor; secret scan; per-tool DLP |
| Cost amplification | D | Agent or user triggers huge model usage | per-tenant TPM; per-feature budget; abort on overshoot |
| Hallucination-induced trust | T | AI-generated narrative treated as data | confidence flags (#238); human approval gate for high-stakes; provenance chips |
| Voice/speech injection | T/I | Audio carries instructions | transcript treated as untrusted text |

### 7.1.5 Plugins, embeds, code blocks

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Plugin escape | E | Plugin reads tokens or DOM outside sandbox | iframe sandbox + capability tokens + CSP; plugin manifest reviewed |
| Code block escape | E | JS block accesses parent context | sandboxed iframe with strict CSP; no cookies/storage |
| Iframe embedding abuse | I/T | Embed site hijacks layout | `sandbox="allow-scripts allow-same-origin"` disabled; auth passthrough only with explicit grant |
| 3D model exploit | T/I | Malicious GLB triggers shader bug | asset scanned; glTF schema validated; sanitized at import |
| Video exploit | T/D | Codec bug crashes player | strict mime; sandboxed video element; fall back to poster |

### 7.1.6 Sharing, publishing, viewer

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Link guessing | I | Random slug guessed | high-entropy slugs; rate-limit; revoke on anomaly |
| Token replay | S/I | Share token reused across sessions | per-session nonce; short-lived tokens |
| Download bypass | I | Download restricted but printed/screenshot | DLP watermarking; per-viewer watermark; screenshot detection best-effort |
| Custom domain takeover | S/E | Attacker proves control of domain | DNS-01 verification; CAA records; auto-revocation on lapse |
| Embed-origin abuse | E | Embed origin reads share token | allowlist of origins; CORS locked |

### 7.1.7 Marketplace & payments

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Listing poisoning | T | Malicious plugin/theme | static scan + sandboxed review; reputation; takedown |
| Payout diversion | E | Attacker redirects creator payout | payout to verified accounts; multi-step approval; KYC |
| License overclaim | I | Asset used without rights | license metadata required; enforcement via DMCA/equivalent flow |
| Cart manipulation | T | Price changed client-side | server-side price; signed receipts |

### 7.1.8 Enterprise, audit, residency

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Audit tampering | R/T | Audit log edited | append-only + WORM + signing |
| Residency bypass | I | Data crosses residency boundary | tenant policy enforcement; signed cross-region transfer |
| DLP bypass | I | Sensitive data leaks via export | DLP runs server-side before export; per-deck DLP rules |
| Legal hold tampering | T | Hold deleted prematurely | hold blocks retention + delete; admin override logged |

### 7.1.9 Operational

| Threat | STRIDE | Description | Mitigation |
|---|---|---|---|
| Supply chain | T/E | Malicious dep | SCA + SBOM + signed images; reproducible builds |
| Misconfig | I/E | Storage bucket public | IaC guardrails; daily detection |
| Insider threat | I/E | Privileged user abuses | least privilege; break-glass with dual-control; just-in-time elevation |
| Backup theft | I | Backup misaccessed | encryption with separate KMS keys; immutable snapshots |
| Token leak | I | Service token in CI | short-lived OIDC tokens; no static secrets in CI |

---

## 7.2 Threat-to-Control Matrix

| Threat | Primary control | Secondary control | Detection |
|---|---|---|---|
| Credential stuffing | MFA + passkey + rate limit | breach check | anomaly detector |
| Session theft | cookies + CSP | passkeys | per-session anomaly |
| CRDT flood | per-deck rate | tenant quota | realtime spike alert |
| CRDT injection | schema validation | reject + quarantine | crash rate alert |
| SSRF | URL allowlist + egress filter | DNS pinning | egress log |
| Data poisoning | provenance + freshness | anomaly | freshness alert |
| Prompt injection (doc) | classifier + system-prompt separation | tool validation | LLM-call diff review |
| Tool abuse | agent scope | dry-run default | agent audit |
| Plugin escape | sandbox + capability tokens | manifest review | runtime violation alert |
| Code block escape | iframe sandbox + CSP | no parent context | CSP report-uri |
| Token replay | per-session nonce | token TTL | replay attempt log |
| Audit tampering | append-only + WORM | signing | integrity check |
| Residency bypass | tenant policy | signed transfer | cross-region log alert |
| DLP bypass | server-side DLP | per-deck rules | blocked-export log |
| Supply chain | SCA + SBOM + signed images | reproducible builds | dependency diff alert |

---

## 7.3 Authentication & Authorization

### 7.3.1 Authentication

- **Users:** email/password (bcrypt/argon2), OAuth (Google, Microsoft), passkeys (WebAuthn).
- **SSO:** OIDC and SAML 2.0; admin can enforce SSO per workspace.
- **SCIM:** provisioning and deprovisioning.
- **MFA:** TOTP, WebAuthn, push (managed via provider).
- **Service-to-service:** OAuth client credentials with short-lived tokens, OIDC federation for cloud workloads.

### 7.3.2 Authorization

- **Roles:** owner, admin, member, guest, reviewer, agent.
- **Scopes per role:** workspace-level and per-deck (view/comment/edit/admin/presenter).
- **Per-deck policy overrides:** brand-lock, region-lock, DLP, residency.
- **Agent scopes (MCP/API):** deck set, action allowlist (read/write/data-binding/render), region allowlist, brand-lock respect, expiry.
- **Delegation:** impersonation tokens for support require dual-control and an audit reason.

### 7.3.3 Session and token

- Cookies: `__Host-` prefix where possible; HttpOnly; Secure; SameSite=Lax.
- Access token: 5 min; refresh: 30 days with rotation.
- Service tokens: OIDC-issued; ephemeral.
- All tokens revocable; revocation propagated via event bus.

---

## 7.4 Secrets Management

- **Vault:** HashiCorp Vault or cloud KMS-backed secret manager.
- **Per-tenant DEKs** wrapped by tenant master key.
- **No secrets in code or .env in repo.** CI uses short-lived federated tokens.
- **Rotation:** every 90 days automatic; on-demand for compromise.
- **Secret leak detection** in commits (gitleaks, truffleHog).

---

## 7.5 Input Validation & Sanitization

- **Boundary:** every API request validated against JSON Schema; extra fields rejected.
- **CRDT materialization** validates schema before producing render commands.
- **Markdown comments** sanitized server-side; CSP enforced client-side.
- **Connector URLs** allowlisted per source type; outbound DNS resolution restricted.
- **File uploads:** type sniffing + magic bytes; sandboxed scanner; size and dimension caps.
- **Font uploads:** allowed MIMEs + max size; license metadata required.
- **3D models:** glTF schema validated; textures scanned.
- **Charts:** data inputs sanitized; numbers clamped; text fields escaped.

---

## 7.6 Rate Limiting & Abuse Prevention

| Endpoint family | Limit (default) | Notes |
|---|---|---|
| Auth login | 5/min/IP, 20/hr/IP | account lockout after 10 failures |
| OAuth callback | 30/min/IP | |
| Editor commands | 600/min/key, 10/sec/burst | per-user, per-deck |
| Data source queries | configurable per source | 429 + Retry-After |
| AI calls | per-tenant TPM | burst 2x, then 429 |
| MCP tool calls | per-agent key | soft and hard limits |
| Webhook delivery | 100/min/webhook | per-target |
| Public deck viewer | 600/min/IP | per-link |
| Audience join | 10/min/IP | plus captcha on suspicion |

Abuse signals: high velocity, low dwell time, suspicious UA, geo-anomaly. Captcha on suspicious flows.

---

## 7.7 Privacy

- **Consent:** explicit, granular, withdrawable; logged in `consent_log`.
- **DSR:** access, correction, erasure, portability, objection, restriction.
- **Children's data:** minimum age 16; no marketing to minors.
- **Data minimization:** analytics events limited to necessary fields; RUM avoids PII.
- **Cross-border transfer:** SCC-equivalent contracts; record of processing activities (RoPA) maintained.
- **BI dashboards and third-party AI providers** are DPA-covered.
- **Privacy by design:** every new feature has a privacy review.

---

## 7.8 Encryption

### 7.8.1 In transit

- TLS 1.3 only.
- HSTS with preload.
- mTLS for worker-to-worker and worker-to-database connections.
- WebRTC for stage with DTLS.

### 7.8.2 At rest

- Postgres TDE / cloud-managed encryption.
- Object storage server-side encryption with customer-managed keys.
- Snapshots encrypted with separate KMS keys.
- Backups encrypted; keys rotated.

### 7.8.3 Field-level

- PII columns encrypted with per-tenant DEK.
- Search indexes: HMAC-based pseudonymization for PII fields.

---

## 7.9 Audit Logging

- Every privileged action and view emits an audit event.
- Append-only; WORM bucket copy; integrity HMAC.
- Searchable via admin console; exportable.
- Retention 7 years (configurable).
- Severity tagging (info/warn/critical).
- Alerts on critical events (mass download, residency bypass, DLP hit).

---

## 7.10 Incident Response

- **On-call rotation** with severity definitions (Sev1–Sev4) and runbooks per service.
- **Sev1: data exposure** triggers immediate containment, customer comms template, regulator notification per PDPA timeline (≤72h).
- **Postmortem** within 5 business days; blameless; action items tracked.
- **Tabletop exercises** quarterly (data exposure, ransomware, AI abuse, residency bypass).
- **External disclosure** template reviewed by legal; coordinated with customer support.
- **Forensic readiness:** logs and snapshots retained per IR retention policy; chain of custody via signed exports.

---

## 7.11 Supply Chain

- **SBOM** generated per build (CycloneDX).
- **Signed container images** (cosign).
- **SCA** in CI (Snyk/Trivy/GitHub Advisory).
- **Reproducible builds** for backend binaries.
- **Vetted base images** only.
- **Dependency mirrors** for offline/regulated environments (BD).
- **License check** in CI.

---

## 7.12 Backup Security

- Backups encrypted with separate KMS keys.
- Access requires dual-control and is audited.
- Quarterly restore drill into isolated environment.
- Immutable copies retained per retention policy.

---

## 7.13 Abuse / Misuse

- Watermarking for confidential decks (per-viewer + per-time).
- Screenshot detection best-effort (DOM heuristics + optional canvas hashing).
- Email/link forwarding detection (recipient identity vs allowed list).
- DMCA / takedown workflow for marketplace.
- Spam prevention: rate limits, captcha, content scan.

---

## 7.14 Plugin & SDK Security

- Plugin manifest declares capabilities.
- Capability tokens map to allowlisted APIs only.
- Plugins cannot access tokens, cookies, or storage beyond granted scope.
- Plugin review checklist: static scan, dependency audit, behavior test.
- Plugin revocation removes capability tokens and quarantines installs.
- SDKs ship with redaction helpers and OAuth best-practice docs.

---

## 7.15 Web Security Headers

- `Content-Security-Policy` with strict default-src; nonce-based scripts; no inline.
- `Strict-Transport-Security` preload.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` denying unused features.
- COOP/COEP for canvas isolation.
- Frame ancestors controlled per surface.

---

## 7.16 Secure SDLC

### 7.16.1 Process

- Threat model in design review for every new feature touching trust boundaries.
- Security checklist in PR template.
- Required checks: lint, type, unit, contract, SAST (CodeQL/Semgrep), DAST (OWASP ZAP on staging), SCA, secret scan, license check.
- Code review requires 1 security-aware reviewer for auth, crypto, payments, residency, AI, plugins.
- Annual external pen test; quarterly internal.

### 7.16.2 Verification (mapped to `09-testing-strategy.md`)

| Control | Test type | Tooling |
|---|---|---|
| Auth | unit + integration | Vitest, Supertest |
| Authz | contract | schema-driven |
| SAST | static | CodeQL, Semgrep |
| DAST | dynamic | OWASP ZAP |
| SCA | dependency | Snyk, Trivy |
| Pen test | manual + automated | external partner |
| Fuzzing | fuzz | AFL + JS fuzzers |
| CRDT resilience | property | fast-check |
| Prompt injection | eval harness | custom |
| Plugin escape | sandbox | e2e + manual |
| Residency | policy | policy tests |

---

## 7.17 Decisions Log

| ID | Decision | Rationale | Alternative |
|---|---|---|---|
| D-SEC-01 | Passkeys + MFA by default | Defense in depth | Password-only — rejected |
| D-SEC-02 | Per-tenant DEKs | Residency + isolation | Single key — rejected |
| D-SEC-03 | Append-only audit with WORM | Immutability | Mutable — rejected |
| D-SEC-04 | Server-side DLP | Cannot trust client | Client-side — rejected |
| D-SEC-05 | Dry-run default for new MCP agents | Blast radius | Full power — rejected |
| D-SEC-06 | iframe sandbox for embeds/code blocks | Strong isolation | Direct DOM access — rejected |
| D-SEC-07 | Watermarking per-viewer | Trace leakage | Generic watermark — insufficient |
| D-SEC-08 | mTLS for worker-to-DB | Internal trust | TLS only — insufficient |

---

## 7.18 Open Decisions

| ID | Decision | Owner |
|---|---|---|
| OD-SEC-01 | Default-on MFA vs opt-in for non-enterprise users. | Security + Product |
| OD-SEC-02 | Whether BI dashboard vendors (Looker, Tableau) require SSO passthrough or only signed URLs. | Enterprise |
| OD-SEC-03 | Required re-key cadence for tenant DEKs (1y vs 3y). | Security |
| OD-SEC-04 | Gaze-tracking / eye-tracking features (#207, #214): on-device-only by default? | Privacy + AI |

---

_End of 07-security-planning.md._