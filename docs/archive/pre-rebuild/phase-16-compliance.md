# Phase 16 — Compliance & Privacy Sign-off

## PDPA / GDPR (Bangladesh + EU)

### Data categories

| Data                       | Stored                        | Retention | Purpose                |
| -------------------------- | ----------------------------- | --------- | ---------------------- |
| `participant_id`           | yes (UUID)                    | 90 days   | session replay + audit |
| `session_code`             | yes (Crockford base32)        | 90 days   | join routing           |
| `display_name`             | yes (optional)                | 90 days   | recap                  |
| `votes/submits/reactions`  | yes (per-engagement table)    | 90 days   | recap                  |
| `attendance_record`        | yes (hash-chained)            | 7 years   | SCORM 2004 4th Ed      |
| `feedback_response`        | yes (nps + stars + free text) | 90 days   | recap                  |
| `device_id` (cookie/local) | yes (UUID)                    | 365 days  | rate-limit + dedup     |
| `idempotency_key`          | yes (24h TTL)                 | 24 hours  | retry safety           |

### Consent flow

Audience `/j/[code]` page surfaces a pre-join consent panel before the
WS handshake completes. The page links to the tenant's privacy policy
and asks for explicit consent. If the participant declines, the join
is rejected and no `participant_id` is allocated.

### Subject access requests (SAR)

- `apps/api` exposes `GET /v1/audience/participants/{participant_id}/export`
  which returns a JSON bundle of all per-participant records.
- `DELETE /v1/audience/participants/{participant_id}` redacts by
  writing `{participant_id: "redacted"}` to every row.

### Cross-border transfers

- Bangladesh tenant data is stored in `ap-south-1` (AWS Singapore) by
  default; EU tenant data stays in `eu-central-1`.
- Migration 0055 sets `current_setting('app.workspace_id', true)` and
  the RLS policy prevents cross-tenant reads at the row level.

### Audit chain

The `attendance_record` chain is the canonical proof-of-presence for
compliance with the SCORM 2004 4th Ed attendance requirement. The
chain is verified by `pnpm --filter @domio/audit-ts verify` and
re-emitted on every SCORM package build.

## Anonymous-identified toggle

Each workspace has `participant_identification: 'anonymous' | 'identified'`
in the workspace config (loaded from `tenant.workspace_config`).

- `anonymous`: participant_id is generated client-side (UUID v4) and
  not linked to any persistent identity. Display name is always
  "Anonymous". The presenter sees aggregate counts only.
- `identified`: participant_id is issued by the participant-ws-gateway
  at WS handshake. The identity is preserved across sessions in the
  same workspace.

The toggle is read at handshake time and enforced by the gateway;
downstream services see no difference.

## Hash chain

`attendance_record` rows are append-only; the Postgres trigger
`trg_attendance_chain` (migration 0057) computes `prev_hash` and
`hash` on every insert. The chain is verified by:

```bash
pnpm --filter @domio/attendance-logger test
# verifyChain() walks the chain and reports broken_at_seq
```

The chain is also exposed via `GET /v1/audience/sessions/{id}/chain`
which returns the JSON-Lines proof consumable by audit consumers.

## CAPTCHA (Turnstile)

The `/j/[code]` page surfaces a Cloudflare Turnstile widget when:

1. The workspace has `captcha.required: true` in its config, OR
2. The participant's `device_id` has been seen on more than 5 sessions
   in the last 24 hours (rate-based escalation).

Turnstile `sitekey` is loaded from `process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY`.
The `apps/api` backend validates the token via the Cloudflare
`siteverify` endpoint before issuing the signed handshake.

The flow is gated by the `audience.captcha` feature flag (default: on
for new workspaces, off for grandfathered).

## Sign-off checklist

- [x] PDPA consent panel on `/j/[code]` join page
- [x] Subject access request + delete endpoints
- [x] Workspace-scoped RLS on every new table (migrations 0055, 0056, 0057)
- [x] Hash-chained attendance log + Postgres trigger
- [x] Anonymous-identified toggle on workspace config
- [x] Cloudflare Turnstile CAPTCHA behind feature flag
- [x] Cross-region tenant isolation (ap-south-1 / eu-central-1)
- [x] Audit chain verified end-to-end in CI:
      `pnpm --filter @domio/audit-ts verify`
- [x] k6 load test (1000-participant) under SLO budgets
- [x] Grafana dashboard `phase-16-audience` deployed
- [x] PagerDuty routing rules for audience services
