# @domio/api

> **Phase 0 stub.** The control plane modular monolith in TypeScript on
> Hono + Node 22. This package is intentionally empty in Phase 0 — only
> the wire-format endpoints (health, readiness, deck placeholder) ship
> here. Business modules (decks, themes, brand kits, AI, …) land in
> Phase 02+.

## Endpoints

- `GET /` — landing JSON.
- `GET /healthz` — process liveness.
- `GET /readyz` — process readiness (Phase 0 always returns ready).
- `GET /v1/decks/:org_id/:tenant_id/:deck_id` — placeholder deck summary.

## Owner

Platform team.

## Runtime

- **Language**: TypeScript.
- **Runtime**: Node 22.
- **HTTP framework**: Hono 4.
- **Validation**: Zod.
- **Logging**: Pino.

## Public API surface

REST: see `contracts/openapi/v1/`. gRPC: not yet exposed (Phase 02).

## Events emitted / consumed

None in Phase 0. NATS JetStream subscription lands in Phase 02.

## Database tables owned

None in Phase 0. Postgres connection lands in Phase 02.

## Feature flags owned

None in Phase 0. The flag service lands in Phase 02.

## Runbook stub

The service runs as a stateless HTTP server behind the gateway. In
Phase 0, liveness and readiness probes are wired but always return
green. Phase 01 wires Postgres + Redis + NATS probes.

## Future work

- Phase 02: real deck module, schema, Postgres, RLS.
- Phase 04: gRPC server alongside HTTP.
- Phase 14: tenant-scoped API keys.
- Phase 20: real auth + SCIM + capability tokens.