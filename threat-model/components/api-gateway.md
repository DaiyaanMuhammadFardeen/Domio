unit: api-gateway
owner: api-platform@example.com
stride:
  S:
    score: 6
    notes:
      - Bearer tokens are HMAC-signed with rotating `kid`s; revocation
        TTL is 60 seconds.
      - JWT public keys are pulled from Vault, validated against an
        in-memory JWKS, refreshed every 5 minutes.
  T:
    score: 4
    notes:
      - Mutating endpoints require `Idempotency-Key` plus a 24-hour
        nonce window — replays return the cached response, not a new
        write.
  R:
    score: 4
    notes:
      - All request envelopes are signed by the client (HMAC-SHA256
        with a Vault-issued key) and the signature is included in the
        audit log.
  I:
    score: 6
    notes:
      - PII in any field goes through `@redact-pii/redactPII` before
        being written to the audit log.
      - List endpoints always scope by `creator_or_owner` — no
        cross-tenant reads possible.
  D:
    score: 9
    notes:
      - Per-IP token bucket: 100 req/sec sustained, 500 burst.
      - Per-account token bucket: 50 req/sec sustained.
      - Upstream services expose a 503 if saturated, gateway maps to
        429 with `Retry-After`.
  E:
    score: 4
    notes:
      - RBAC checks live inside the request handler, not in the router.
