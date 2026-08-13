/**
 * @domio/theme-service — Phase 07 A.1 design-token, theme, and override
 * management.  REST handler surface lives in `./handlers.js`; the
 * transport-agnostic service is `./service.js`; persistence is
 * `./dal.js`.
 *
 * Public surface:
 *
 *  - {@link ThemeService} — token CRUD, alias CRUD, theme CRUD,
 *    override CRUD, theme apply, engine read-throughs.
 *  - In-memory repositories for tests + dev fallback.
 *  - Errors with stable `.code` strings: `TOKEN_ALIAS_CYCLE`,
 *    `TOKEN_REFERENCED`, `INVALID_TOKEN_ID`, `TOKEN_VALIDATION_ERROR`,
 *    `THEME_NOT_FOUND`.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
