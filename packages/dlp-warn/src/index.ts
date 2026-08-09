/**
 * @domio/dlp-warn — public surface.
 *
 * P20.5 B3. Warning-only content scanner for share/export flows.
 *
 * Public exports:
 *   - `DlpScanner`, `dlpScanner` — the regex scanner.
 *   - `luhnValid` — Luhn check helper (exposed for tests).
 *   - `DlpMatch`, `DlpScanInput`, `DlpScanResult` — types.
 *   - `DlpRuleId`, `DLP_RULE_IDS` — enum.
 *   - `DLP_SNIPPET_REDACTED`, `DLP_MAX_INPUT_LENGTH` — constants.
 *   - `DlpValidationError` — error.
 */

export * from './types.js';
export * from './scanner.js';
export * from './luhn.js';
export * from './summary.js';