# ADR-2026-006: Content-addressed bundle store

## Status

`accepted`

## Date

2026-08-02

## Context

Component packages ship binary/large payloads (SVG/icon assets, Lottie JSON,
fonts, sticker packs) alongside their manifest. Serving these safely requires
integrity guarantees: a tampered blob must never be installable, cache
behavior should be trivial, and the same payload published twice (common for
variants of a design) should not be stored twice. The phase plan mandates
"content-addressed bundle store with hash verification" and signed URLs.

## Decision

We will store bundle blobs **content-addressed by SHA-256** and reference them
by hash from the package manifest.

- `bundles.putBlob` stores `(sha256, bytes)`; lookups are by hash only.
- A package manifest's `files` map lists `{name → sha256}`; a version is
  immutable once published (its `package_hash` is the SHA-256 of the canonical
  manifest body).
- **Install performs hash verification**: every referenced blob is re-read and
  re-hashed before the install proceeds. A mismatch raises
  `ERR_TAMPERED_PACKAGE` (409).
- **URLs**:
  - Free packages: immutable long-lived URLs `/bundles/{sha256}`.
  - Paid/private bundles: short-lived signed URLs (HMAC query signature, TTL
    from `limits.signedUrlTtlMs`, default 5 min).
- Identical payloads dedupe automatically because the address is the hash.
- The storage adapter (`blobs` table) is behind `RegistryStore.putBlob/getBlob/
  hasBlob` so a future object store (MinIO/S3) can replace Postgres `bytea`
  without touching service logic.

## Alternatives considered

- **Signed-by-name URLs** (e.g. `/bundles/{id}` with a JWT): rejected — the
  URL reveals nothing about content, breaking cache validation and
  deduplication; revocation complexity without integrity benefit.
- **Inline payloads in the manifest**: rejected — blows the JSONB size,
  defeats dedup, and forces hash verification to re-parse manifests.

## Consequences

- Cache-friendly URLs and trivial deduplication.
- Integrity is enforced at install (defense in depth; the DB also checks the
  hash at write).
- Removing a blob requires no dangling-reference scan: blobs are GC'd only
  when unreferenced by any package (worker), never on package delete.
