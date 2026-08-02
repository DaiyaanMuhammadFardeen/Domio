/**
 * @domio/brand-service — Phase 07 A.3 brand kits, brand contexts,
 * sub-brand relationships, and extraction jobs.
 *
 * Public surface:
 *
 *  - {@link BrandService} — kit CRUD, publish/unpublish/archive,
 *    sub-brand DAG, brand contexts, extraction job lifecycle.
 *  - In-memory repositories for tests + dev fallback.
 *  - REST handlers in `./handlers.js`.
 *  - Errors with stable `.code` strings: `BRAND_KIT_NOT_FOUND`,
 *    `BRAND_KIT_VALIDATION_ERROR`, `BRAND_KIT_IMMUTABLE`,
 *    `SUB_BRAND_CYCLE`, `SUB_BRAND_DUPLICATE`,
 *    `BRAND_CONTEXT_NOT_FOUND`, `BRAND_EXTRACTION_JOB_NOT_FOUND`.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
