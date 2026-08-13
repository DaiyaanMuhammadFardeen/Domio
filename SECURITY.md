# Security Policy

> Domio handles multi-tenant user content (decks, designs, brand assets, marketplace transactions, AI prompts, audience data) and is designed for enterprise + consumer use. We take security seriously.

---

## Supported versions

| Version               | Supported                       |
| --------------------- | ------------------------------- |
| `main`                | ✅ Active development           |
| Latest tagged release | ✅ Security fixes for 12 months |
| Older than the latest | ⚠️ Best-effort, no SLA          |

---

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Email **`security@domio.example`** (placeholder — replace before public release) with:

1. A description of the vulnerability.
2. Steps to reproduce (proof-of-concept preferred).
3. The impact and attack scenario you envision.
4. Whether you're disclosing publicly and on what timeline.

We commit to:

- **Acknowledgement within 48 hours.**
- **Triage within 5 business days**, with a severity estimate.
- **A patch timeline** agreed with you, based on severity.
- **Coordinated disclosure**: we will not publicly disclose the issue until a fix is shipped and you've had a chance to confirm.

If you would like encrypted communication, request the PGP key in your initial email and we'll send a key fingerprint.

### Severity framework

| Severity     | Examples                                                                                                         | Patch target |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| **Critical** | RCE, auth bypass, data exfiltration, tenancy isolation break                                                     | 24 hours     |
| **High**     | Privilege escalation, persistent XSS, SSRF to internal, secret disclosure                                        | 7 days       |
| **Medium**   | CSRF on state-changing endpoints, stored XSS without auth, broken access control on a non-critical surface       | 30 days      |
| **Low**      | Information leakage (error messages), missing rate limiting on a non-critical endpoint, missing security headers | Next release |

---

## Security architecture

Domio is built with these first-principle controls:

- **Tenant isolation** — every multi-tenant table has Row-Level Security; every query goes through a policy-bound connection.
- **RBAC + scoped ABAC** — capability + per-resource attributes.
- **Short-lived capability tokens** — never a long-lived API key on the wire.
- **Vault-managed credentials** — no secret in env files in production.
- **Sandboxed plugin / embed / code runtime** — QuickJS / V8 isolates with capability ceilings.
- **Signed webhooks** — HMAC-SHA256 with replay protection.
- **Append-only audit** — every privileged action lands in an immutable log.
- **Encryption at rest and in transit** — TLS 1.3, AES-256-GCM, per-tenant KMS keys.
- **Residency-aware routing** — data stays in the region the org specifies.

For the full threat model, see [`docs/07-security-planning.md`](docs/07-security-planning.md).

---

## Bug bounty

We do not currently run a paid bug bounty program. Severe reports may receive acknowledgement and a swag package at our discretion.

---

## Private advisories

Security advisories for fixed-but-not-yet-public vulnerabilities are published at `https://github.com/DaiyaanMuhammadFardeen/Domio/security/advisories` (when the repo is public).

---

_End of SECURITY.md._
