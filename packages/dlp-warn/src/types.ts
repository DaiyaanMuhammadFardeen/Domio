/**
 * @domio/dlp-warn — types.
 *
 * P20.5 B3 (soft DLP warnings). Regex-only content scanner that flags risky
 * content in share/export flows. **Never blocks** — callers render a
 * warning banner and (optionally) record the bypass in the audit log.
 *
 * Full DLP rule engine, pre-built PII/financial/BD-NID packs, ML classifier,
 * and hard `block` severity land in full P20 WS-X3 once enterprise pilots
 * start. P20.5 deliberately ships a warning-only surface.
 */

// ---------------------------------------------------------------------------
// Rule ids
// ---------------------------------------------------------------------------

export const DLP_RULE_IDS = ['credit_card', 'email', 'us_ssn'] as const;
export type DlpRuleId = (typeof DLP_RULE_IDS)[number];

export interface DlpMatch {
  readonly ruleId: DlpRuleId;
  /** The matched text, returned to the caller (caller decides redaction). */
  readonly snippet: string;
  /** Position in the input string. */
  readonly index: number;
  /** Length of the match. */
  readonly length: number;
}

export interface DlpScanInput {
  readonly text: string;
  /** Optional context used by callers to attribute the scan. */
  readonly context?: Record<string, string>;
}

export interface DlpScanResult {
  readonly matches: readonly DlpMatch[];
  readonly hasMatches: boolean;
  readonly matchedRuleIds: readonly DlpRuleId[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DLP_MAX_INPUT_LENGTH = 5_000_000; // 5 MB; refuse larger blobs
export const DLP_MAX_MATCHES_PER_RULE = 100; // cap per rule to bound CPU
export const DLP_SNIPPET_CONTEXT_CHARS = 24; // snippet = matched value only
export const DLP_SNIPPET_REDACTED = '████████'; // for admin summaries

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DlpValidationError extends Error {
  readonly code = 'DLP_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DlpValidationError';
  }
}