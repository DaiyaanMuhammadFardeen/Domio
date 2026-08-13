# Phase 14 W1 — Share-link data plane

This document covers the operator-facing surface of the W1 share-link
data plane. For the planning summary and rationale, see
`docs/development_phases/phase-14-sharing-publishing.md` W1.

## What ships in W1

- `services/share-api` — REST surface + service orchestrator.
- `packages/signed-link-token` — short-id + token mint/verify.
- `packages/audit-ts` — TS port of the P13 hash-chained audit log.
- `infrastructure/postgres/migrations/0041_phase14_sharing.{up,down}.sql`
  — six new tables with RLS keyed to `workspace_id`.
- `contracts/openapi/v1/shares.yaml` — OpenAPI 3.1.

## Endpoints

| Endpoint                             | Method | Notes                                    |
| ------------------------------------ | ------ | ---------------------------------------- |
| `/v1/shares`                         | POST   | Create. 201 with snapshot + token.       |
| `/v1/shares/{link_id}`               | GET    | Read. 200/404.                           |
| `/v1/shares/{link_id}`               | PATCH  | Update. Requires `If-Match: <seq>`.      |
| `/v1/shares/{link_id}`               | DELETE | Soft-revoke. Requires `If-Match: <seq>`. |
| `/v1/shares/{link_id}/rotate-token`  | POST   | Mint a fresh token.                      |
| `/v1/shares/{link_id}/extend-expiry` | POST   | Push expiry forward.                     |
| `/v1/shares/{link_id}/policy`        | GET    | Read the policy.                         |
| `/v1/shares/{link_id}/policy`        | PUT    | Replace policy fields.                   |
| `/mcp/share-introspect`              | POST   | Verify a token (no session).             |

## Environment

Share-api is configured via the following environment variables:

| Variable                | Description                                  | Default                               |
| ----------------------- | -------------------------------------------- | ------------------------------------- |
| `SHARE_API_PORT`        | HTTP listen port.                            | `8087`                                |
| `SHARE_API_STORE`       | `memory` or `pg`. M2 wires the pg store.     | `memory`                              |
| `DATABASE_URL`          | Required when `SHARE_API_STORE=pg`.          | —                                     |
| `SHARE_AUDIT_HMAC_KEY`  | Hex-encoded 32-byte key for the audit chain. | dev fallback (sha256 of a fixed seed) |
| `SHARE_LINK_TOKEN_KEY`  | Hex-encoded 32-byte key for mint/verify.     | —                                     |
| `SHARE_API_NONCE_STORE` | `memory` or `redis`. M2 wires Redis.         | `memory`                              |
| `REDIS_URL`             | Required when `SHARE_API_NONCE_STORE=redis`. | —                                     |

> **Production must set** both `SHARE_AUDIT_HMAC_KEY` and
> `SHARE_LINK_TOKEN_KEY` to distinct random 32-byte hex values. The
> dev fallbacks are deterministic and known-public.

Generate keys:

```bash
openssl rand -hex 32   # produces a 64-char hex string; suitable for either env var
```

## Capability scopes

| Scope          | Grants                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| `share:create` | `POST /v1/shares`                                                          |
| `share:read`   | `GET /v1/shares/{id}` and `/v1/shares/{id}/policy`                         |
| `share:update` | `PATCH /v1/shares/{id}`, `PUT /v1/shares/{id}/policy`, `.../extend-expiry` |
| `share:delete` | `DELETE /v1/shares/{id}`                                                   |
| `share:rotate` | `POST /v1/shares/{id}/rotate-token`                                        |
| `share:policy` | `PUT /v1/shares/{id}/policy`                                               |

The `/mcp/share-introspect` endpoint does NOT require any session
scope — the signed token is the credential.

## Audit emission

Every privileged action emits one hash-chained event into the
`agent_audit_event` table via `@domio/audit-ts`. The event payload
keys are:

| `event_type`            | Trigger                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `share.created`         | `POST /v1/shares`                                                                  |
| `share.updated`         | `PATCH /v1/shares/{id}` when only link-level fields change                         |
| `share.policy_changed`  | `PATCH /v1/shares/{id}` or `PUT .../policy` when at least one policy field changes |
| `share.token_rotated`   | `POST .../rotate-token`                                                            |
| `share.expiry_extended` | `POST .../extend-expiry`                                                           |
| `share.deleted`         | `DELETE /v1/shares/{id}` (soft-revoke)                                             |

Each event payload includes `actor_id`, `link_id`, `ts`, `before`
(snapshot), and `after` (snapshot) so the audit chain is
self-describing for forensic replay.

HMAC keys are rotated with a 7-day overlap and a 90-day hard
expiry. Operators must rotate `SHARE_AUDIT_HMAC_KEY` at least
every 90 days; the chain will continue to verify old events under
the previous key for the first 7 days of the overlap.

## Migration

Apply:

```bash
psql "$DATABASE_URL" -f infrastructure/postgres/migrations/0041_phase14_sharing.up.sql
```

Roll back:

```bash
psql "$DATABASE_URL" -f infrastructure/postgres/migrations/0041_phase14_sharing.down.sql
```

The migration is idempotent at the table level (uses `CREATE TABLE
IF NOT EXISTS`) and safe to re-run; the down migration drops
objects in reverse FK order.

## What's NOT in W1

- W2 access-policy engine (decision tree + viewer-claims evaluator).
- W3 watermark rendering (the `watermark_profile` table is created
  but unused).
- W4 custom domains (no DNS or cert wiring).
- W5/W6 viewer/embed-proxy changes (introspect endpoint is ready
  but not yet called by the embed-proxy).
- W7 narration.
- W8 share-triggered export pipeline.
- W9 SEO/social/print (the `seo_metadata` table is created but unused).
- W10 internal event bus.
- The editor UI (`apps/editor`) is not touched by W1.
