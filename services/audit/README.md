# @domio/audit-service

> Lightweight append-only audit log (P20.5 B2).
>
> Backs every state-changing action in the Domio application with an
> `audit_event` row written via the outbox pattern in the same Postgres
> transaction. 90-day default retention; admin query UI; CSV export.
>
> Full tamper-evident hash-chained log, ClickHouse projection, WORM bucket,
> and 7-year retention land in full P20 WS-X2 once enterprise pilots start.
> P20.5 deliberately ships a smaller surface so beta can launch without
> waiting on the enterprise compliance work.

## Owner

Platform squad.

## Public API surface

```ts
import { AuditService, AuditHandlers, parseAuditQuery } from '@domio/audit-service';

// Outbox emit (joins caller's transaction):
await audit.emit(
  {
    tenantId: 'ws-1',
    actorId: 'alice',
    action: 'deck.shared',
    targetKind: 'deck',
    targetId: 'd-42',
    metadata: { shareKind: 'public' },
  },
  { pg: caller'sPgClient },
);

// Standalone emit (fire-and-forget background jobs):
await audit.emit({ tenantId: 'ws-1', action: 'auth.login' });

// Query:
const { events, total } = await audit.query({
  tenantId: 'ws-1',
  actorId: 'alice',
  action: ['deck.shared', 'deck.exported'],
  from: new Date('2026-07-01'),
  to: new Date('2026-08-01'),
  limit: 50,
});

// Retention:
const { rowsDeleted } = await audit.runRetention('ws-1'); // default 90 days
const n = await audit.dryRunRetention('ws-1', 30);
```

The `AuditHandlers` class wires the four REST endpoints under
`/v1/admin/audit`. The tenant id is derived from the caller's auth context,
never trusted from the request.

## Action enum (P20.5 §4.2.3)

`auth.login`, `auth.login_failure`, `auth.logout`, `auth.mfa_enrolled`,
`auth.mfa_unenrolled`, `auth.password_changed`, `user.created`,
`user.disabled`, `user.role_changed`, `deck.created`, `deck.edited`,
`deck.deleted`, `deck.shared`, `deck.unshared`, `deck.exported`,
`share.created`, `share.revoked`, `billing.changed`, `dlp.warning_shown`,
`dlp.bypass_acknowledged`, `policy.denied`, `rate_limit.exceeded`,
`rate_limit.anomaly`, `tenant.circuit_breaker_engaged`.

## Database tables owned

- `audit_event` (migration `0025_audit_event.up.sql`) — append-only; RLS
  enforced; `app` DB role lacks UPDATE/DELETE/TRUNCATE.
- `audit_retention_run` — nightly sweep ledger.

## Sensitive-field guard

`validateEventInput` rejects `metadata` keys named `password`,
`password_hash`, `mfa_secret`, `mfa_secret_enc`, `token`, `access_token`,
`refresh_token`, `session_token`, `credit_card`, `ssn`,
`social_security_number` (case-insensitive). This protects against
accidentally logging credentials into the audit trail.

## Runbook stub

- Retention sweep: `await audit.runRetention(tenantId)` — safe to run
  nightly; idempotent.
- Dry-run first: `await audit.dryRunRetention(tenantId)` returns count of
  rows that WOULD be deleted.
- Manual replay from JSONL: `auditService.emitMany(events)` accepts a
  parsed JSON array of `AuditEventInput`.
