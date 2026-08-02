/**
 * @domio/font-service — Phase 07 custom font upload + license gating.
 *
 * Public surface:
 *
 *  - {@link FontService} — upload, fetch, list, license update, delete.
 *  - In-memory repository for tests + dev fallback.
 *  - REST handlers in `./handlers.js`.
 *  - Errors with stable `.code` strings: `FONT_NOT_FOUND`,
 *    `FONT_VALIDATION_ERROR`, `FONT_LICENSE_BLOCKED`.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
