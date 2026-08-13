# Threat Model — Phase 01 Process

This document defines how we identify, score, and mitigate threats to the
Domio platform. Every component in `threat-model/components/` is a STRIDE
decomposition of a single deployable unit.

## Methodology

We use STRIDE with the following severity matrix:

| Severity | Description                                                                           |
| -------- | ------------------------------------------------------------------------------------- |
| Critical | Permanent data loss, full-tenant breach, regulator reportable. Triggers `SEV-0`.      |
| High     | Tenant data exposure, primary path compromise. Triggers `SEV-1`.                      |
| Medium   | Bounded data exposure or DoS. Triggers `SEV-2`.                                       |
| Low      | Self-inflicted or unauthenticated-trivial. Triggers `SEV-3`, addressed in next minor. |
| Info     | Hygiene only; no business impact                                                      |

The score (likelihood × impact) is computed as `score = L * I` where both
are `1..5`. Threshold:

- `score >= 16` → Critical
- `score >= 9` → High
- `score >= 4` → Medium
- otherwise → Low

## Cadence

- Component owners review their STRIDE file quarterly.
- After every `SEV-1` or higher, the relevant files get a `MOC:` marker
  that points to the post-mortem.
- `.github/workflows/threat-model-diff.yml` enforces a check: every PR
  that touches a file under `threat-model/components/` must also
  validate the file against the schema in
  `threat-model/__tests__/schema.test.ts`.

## Privacy posture

By design, the platform never persists PII at rest in:

- Trace or log payloads (redaction is built into `@domio/observability`,
  `@redact-pii`)
- Database primary keys (only opaque IDs; NID, phone, email are indexed
  via HMAC, see `docs/runbooks/bangladesh-mirror-fallback.md` for index
  reasoning)
- S3 / MinIO buckets (server-side encryption + KMS per env)

## Out of scope (Phase 01)

- Subscriber-side device compromise — covered by a separate
  `device-trust-model.md` once we have Phase 05 deliverable.
- Insider threats from a compromised CI runner — covered by SLSA L3
  attestation (Phase 04).
