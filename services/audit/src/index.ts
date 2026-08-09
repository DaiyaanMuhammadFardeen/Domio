/**
 * @domio/audit-service — public surface.
 *
 * P20.5 B2 (lightweight audit log). Append-only Postgres-backed audit log
 * with synchronous outbox emit, query, CSV export, and 90-day retention.
 *
 * Public exports:
 *   - `AuditService` — emits and queries events.
 *   - `AuditHandlers` — REST handlers for `/v1/admin/audit/*`.
 *   - `InMemoryAuditStore` / `PgAuditStore` — store adapters.
 *   - `parseAuditQuery`, `serializeEvent` — request/response helpers.
 *   - `AuditEvent`, `AuditEventInput`, `AuditQuery`, `AuditQueryResult` — types.
 *   - `AuditAction`, `AUDIT_ACTIONS`, `ACTOR_KINDS`, `ActorKind` — enums.
 *   - `DEFAULT_RETENTION_DAYS`, `MAX_QUERY_LIMIT`, `DEFAULT_QUERY_LIMIT` — constants.
 */

export * from './types.js';
export * from './stores.js';
export * from './service.js';
export * from './handlers.js';