/**
 * @domio/query-gateway — Phase 08 M2 live-data query gateway.
 *
 * Provides rate limiting, caching, ACL, webhook handling, and viewer
 * token management for executing live-data queries.
 *
 * 5 routes:
 *   POST /v1/queries/execute    — execute a query
 *   POST /v1/queries/webhook    — receive a webhook callback
 *   POST /v1/queries/invalidate — invalidate cached results
 *   POST /v1/viewer-tokens      — issue viewer tokens
 *   GET  /v1/queries/:id        — get query status/snapshot
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
