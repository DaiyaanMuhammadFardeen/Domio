# ADR-2026-007: License JWTs with 30-day offline grace

## Status

`accepted`

## Date

2026-08-02

## Context

Paid marketplace components must be enforced both online and offline. Deck
editing happens in a desktop/web editor that may be disconnected; agents (MCP)
must not be able to forge entitlements by talking to the registry directly.
We need verifiable grants that survive a network drop but expire on a known
schedule, plus a seat model and revocation.

## Decision

We will issue **compact JWTs (HS256, HMAC-SHA-256)** as license grants, signed
with a service secret, with claims mirroring the `license_grant` row:

- Claims: `iss=domio-registry`, `sub=<licenseId>`, `catalog_id`, `version`,
  `listing_id`, `seats`, `workspace_id`, `iat`, `exp` (1-year subscription
  window), `offline_grace_until = exp + 30 days`.
- **Verification order**: JWS signature → catalog/version claim match → server
  revocation check → expiry, with the 30-day offline grace honored while
  `now <= offline_grace_until`.
- **Seats** are enforced server-side by summing active (non-revoked) grants for
  the workspace+catalog against the license's `seats` claim
  (`ERR_SEAT_LIMIT`, 403).
- Revocation is a server-side state flip (`revokedAt`); revoked tokens fail
  verification even inside the grace window.
- The JWS implementation lives in `src/crypto/jws.ts` (WebCrypto HMAC-SHA256,
  no external dependency) so tests can sign/verify deterministically and the
  same code runs in the verifier.

## Alternatives considered

- **Server-only entitlement checks**: rejected — no offline rendering, and
  every prop edit would need a round-trip.
- **Asymmetric (RS256/ES256)**: deferred — symmetric is sufficient while the
  registry is the only issuer; the claim layout is key-agnostic so rotating to
  asymmetric later only changes the crypto layer.
- **Long-lived opaque tokens**: rejected — no expiry/grace semantics and no
  self-verification without a DB hit.

## Consequences

- Clients can verify grants offline for up to 30 days past expiry.
- Secret rotation must be coordinated (signer rotates, verifier accepts the
  previous secret for one overlap window).
- Grants are compact (~300 bytes) and storable in localStorage for offline use.
