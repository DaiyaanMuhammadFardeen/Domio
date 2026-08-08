# @domio/presenter-session

> **Phase 15 W1.** Source-of-truth service for a live presenter session.

## Public API

- `PresenterSessionService` — orchestration class.
- `InMemoryPresenterSessionStore` — test/dev persistence.
- `PgPresenterSessionStore` — Postgres persistence.
- `IdempotencyStore` (in-memory + Redis-backed variants).
- `AuditEmitter` + `presenterAuditKey`.
- REST handlers in `./handlers.js` (start / end / advance / annotate / plan / handover / failover / recap).
- Types & errors in `./types.js`.
- State machine in `./state_machine.js`.
- ETag helpers in `./etag.js`.

## Capabilities

- `presenter:start`, `presenter:end`, `presenter:advance`, `presenter:annotate`,
  `presenter:plan`, `presenter:handover`, `presenter:failover`, `presenter:recap`.

## Build / test

```bash
pnpm build
pnpm test
```
