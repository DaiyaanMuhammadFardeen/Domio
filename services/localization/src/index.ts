/**
 * @domio/localization — Phase 08 locale-aware formatting, decimal
 * arithmetic, and exchange-rate management.
 *
 * Public surface:
 *
 *  - {@link LocalizationService} — number/currency/percent/date formatting,
 *    exchange rate ingestion and conversion.
 *  - {@link Decimal} — fixed-point decimal arithmetic avoiding float errors.
 *  - In-memory repositories for tests + dev fallback.
 *  - Errors with stable `.code` strings: `INVALID_LOCALE`,
 *    `INVALID_CURRENCY`, `MISSING_RATE`.
 */

export * from './dal.js';
export * from './format.js';
export * from './decimal.js';
export * from './rates.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
