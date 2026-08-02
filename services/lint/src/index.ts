/**
 * @domio/lint-service — Phase 07 style linting.
 *
 * Public surface:
 *
 *  - {@link LintService} — runLint, getRun, listByDeck, latestForDeck.
 *  - In-memory repository for tests + dev fallback.
 *  - REST handlers in `./handlers.js`.
 *  - Errors with stable `.code` strings: `LINT_VALIDATION_ERROR`.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
