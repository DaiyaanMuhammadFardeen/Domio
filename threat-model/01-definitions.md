# STRIDE Component Definitions

Each file in `threat-model/components/<unit>.md` follows this shape:

```yaml
unit: api-gateway # matches the binary name + the file basename
owner: editor-platform@example.com
stride:
  S:
    score: 4
    notes: Spoofing notes
  T:
    score: 6
    notes: Tampering notes
  R:
    score: 8
    notes: Repudiation notes
  I:
    score: 8
    notes: Information disclosure notes
  D:
    score: 6
    notes: Denial of service notes
  E:
    score: 4
    notes: Elevation of privilege notes
```

`score` is `L * I`, both integer `1..5`. Total severity is the maximum of
all six scores; the table is described in `00-process.md`.

## Per-STRIDE questions

### S — Spoofing

- Can the principal be impersonated by reusing a stolen bearer token?
- Can the principal be impersonated by replacing a JWT public key?
- Can the principal be impersonated by replaying an `Idempotency-Key`
  from a different source IP?

### T — Tampering

- Are authoritative rows protected from in-place updates that lack a
  `updated_at` audit trail?
- Are blob writes signed by the writer's key (HMAC, not just object ACL)?

### R — Repudiation

- Can a user deny a write? (audit log + hash chain required)
- Can a service deny a request? (request envelope + signing identity)

### I — Information disclosure

- Is there any path that returns PII without a `creator_or_owner`
  scope check?
- Are logs free of PII (redaction library applied at ingest)?

### D — Denial of service

- Is the user-facing request rate bounded?
- Is the queue drain rate bounded (so a noisy neighbor can't starve)?

### E — Elevation of privilege

- Is RBAC enforced at the handler, not just the route table?
- Are service accounts scoped down to the minimum set of permissions?

## Updating a component file

1. Open a PR against `master` with the file change.
2. The `threat-model-diff.yml` workflow validates STRIDE structure and
   ensures no score regressed without a documented justification.
3. After merge, the OWNER signs off in the PR thread.
