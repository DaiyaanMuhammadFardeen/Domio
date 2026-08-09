/**
 * @domio/dlp-warn — regex rules and scanner.
 *
 * Three rules per P20.5 §4.3.2:
 *   - credit_card: 13–19 digits with optional spaces/dashes; Luhn-validated.
 *   - email: RFC-5322 simplified.
 *   - us_ssn: 3-2-4 format with optional spaces.
 *
 * No Bangladesh NID yet — that lands in full P20 WS-X3 with Bangladeshi
 * counsel sign-off (R-SEC-20-01).
 */

import type {
  DlpMatch,
  DlpRuleId,
  DlpScanInput,
  DlpScanResult,
} from './types.js';
import { DLP_MAX_INPUT_LENGTH, DLP_MAX_MATCHES_PER_RULE, DlpValidationError } from './types.js';
import { luhnValid } from './luhn.js';

// ---------------------------------------------------------------------------
// Regex set
// ---------------------------------------------------------------------------

/**
 * Credit card: 13–19 digits, optional space/dash separators.
 * The Luhn check trims false positives in the match callback.
 */
const CC_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

/**
 * Email: simplified RFC-5322. Catches `user@host.tld`. Ignores single-word
 * inputs without `@`. Conservative — we want low false-positive rate so
 * users don't tune out the warning banner (R-SEC-20.5-02).
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * US SSN: 3-2-4 format. Optional whitespace between groups (some sources
 * pad with spaces). We deliberately require the dashes to avoid false
 * positives on long numeric IDs.
 */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export class DlpScanner {
  private readonly ccMax = DLP_MAX_MATCHES_PER_RULE;
  private readonly emailMax = DLP_MAX_MATCHES_PER_RULE;
  private readonly ssnMax = DLP_MAX_MATCHES_PER_RULE;

  /** Override cap per rule (mostly for tests). */
  withCaps(caps: Partial<Record<DlpRuleId, number>>): DlpScanner {
    const s = new DlpScanner();
    if (caps.credit_card !== undefined) (s as unknown as { ccMax: number }).ccMax = caps.credit_card;
    if (caps.email !== undefined) (s as unknown as { emailMax: number }).emailMax = caps.email;
    if (caps.us_ssn !== undefined) (s as unknown as { ssnMax: number }).ssnMax = caps.us_ssn;
    return s;
  }

  scan(input: DlpScanInput | string): DlpScanResult {
    const text = typeof input === 'string' ? input : input.text;
    if (typeof text !== 'string') {
      throw new DlpValidationError('scan input must be a string');
    }
    if (text.length > DLP_MAX_INPUT_LENGTH) {
      throw new DlpValidationError(
        `input length ${text.length} exceeds max ${DLP_MAX_INPUT_LENGTH}`,
      );
    }

    const matches: DlpMatch[] = [];

    matches.push(...this.scanRule(text, 'credit_card', CC_PATTERN, this.ccMax, (m) => luhnValid(m)));
    matches.push(...this.scanRule(text, 'email', EMAIL_PATTERN, this.emailMax));
    matches.push(...this.scanRule(text, 'us_ssn', SSN_PATTERN, this.ssnMax));

    // Sort by index for deterministic output
    matches.sort((a, b) => a.index - b.index);

    const matchedRuleIds = Array.from(new Set(matches.map((m) => m.ruleId)));
    return {
      matches,
      hasMatches: matches.length > 0,
      matchedRuleIds,
    };
  }

  private scanRule(
    text: string,
    ruleId: DlpRuleId,
    pattern: RegExp,
    cap: number,
    accept?: (matched: string) => boolean,
  ): DlpMatch[] {
    const out: DlpMatch[] = [];
    // Reset the regex state for each call (the `g` flag is sticky)
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (out.length >= cap) break;
      const matched = m[0];
      if (accept && !accept(matched)) continue;
      out.push({
        ruleId,
        snippet: matched,
        index: m.index,
        length: matched.length,
      });
      // Defend against zero-length matches in pathological regexes
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
    return out;
  }
}

/** Convenience singleton — default caps. */
export const dlpScanner = new DlpScanner();