/**
 * @domio/prototype-recorder-service — Phase 10 M5 telemetry data plane.
 *
 * Append-only event ledger with chained HMAC, DSR endpoints, and PDPA
 * retention cron. Public surface:
 *
 *   - {@link PrototypeRecorderService} — business logic; ingest, list,
 *     DSR, retention, key rotation.
 *   - {@link IntegrityChain} — pure HMAC chain math; testable in
 *     isolation.
 *   - In-memory repositories for tests + dev fallback.
 *   - REST handlers with schema validation.
 *   - DSR handlers in `./dsr.ts` (separate file to keep the surface
 *     partition visible).
 *   - Retention cron in `./retention.ts`.
 *   - Error types with stable `.code` strings.
 */

export * from './types.js';
export * from './dal.js';
export * from './integrity.js';
export * from './service.js';
export * from './handlers.js';
export * from './dsr.js';
export * from './retention.js';
export * from './metrics.js';
export * from './audit.js';
export * from './schemas.js';
