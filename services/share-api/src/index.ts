/**
 * @domio/share-api — share-link data plane (Phase 14 W1).
 *
 * Public surface:
 *  - {@link ShareService} — orchestration.
 *  - REST handlers in `./handlers.js` (POST/GET/PATCH/DELETE /v1/shares,
 *    POST /v1/shares/{id}/rotate-token, POST .../extend-expiry,
 *    GET/PUT .../policy, POST /mcp/share-introspect).
 *  - Types and errors in `./types.js`.
 *  - Store interface + in-memory + pgx skeleton in `./store/store.js`,
 *    `./store/mem_store.js`, `./store/pg_store.js`.
 *  - Audit emission in `./audit/emit.js`, key helper in `./audit/key.js`.
 */

export * from './types.js';
export * from './service.js';
export * from './handlers.js';
export * from './store/store.js';
export * from './store/mem_store.js';
export * from './store/pg_store.js';
export * from './audit/emit.js';
export * from './audit/key.js';
