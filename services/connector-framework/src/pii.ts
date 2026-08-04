/**
 * Connector framework — PII detection (Phase 08).
 *
 * Scans the first ~50 sample rows per column and flags PII types.
 * Reuses regex patterns from @domio/redact-pii.
 *
 * A column is flagged if ≥ 3 distinct values match a PII pattern.
 */

import type { CanonicalColumn, PiiLevel, PiiType } from './types.js';

// ---------------------------------------------------------------------------
// PII regex patterns (simplified versions of @domio/redact-pii patterns)
// ---------------------------------------------------------------------------

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;
const PHONE_RE = /\+?\d{8,15}\b/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

interface PiiPattern {
  readonly id: PiiType;
  readonly regex: RegExp;
}

const PII_PATTERNS: PiiPattern[] = [
  { id: 'email', regex: EMAIL_RE },
  { id: 'phone', regex: PHONE_RE },
  { id: 'ip', regex: IP_RE },
  { id: 'ssn', regex: SSN_RE },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const MATCH_THRESHOLD = 3;

/**
 * Detect PII columns in sample data.
 * Returns a map of column name → PII level.
 */
export function detectPiiColumns(
  columns: CanonicalColumn[],
  sampleRows: ReadonlyArray<ReadonlyArray<unknown>>,
): Map<string, PiiLevel> {
  const result = new Map<string, PiiLevel>();

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx]!;
    if (col.type !== 'string') {
      result.set(col.name, 'none');
      continue;
    }

    const foundTypes = new Set<PiiType>();
    for (const pattern of PII_PATTERNS) {
      const matches = new Set<string>();
      for (const row of sampleRows) {
        const val = row[colIdx];
        if (typeof val !== 'string') continue;
        const str = val as string;
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.regex.exec(str)) !== null) {
          if (m[0]) matches.add(m[0]);
        }
      }
      if (matches.size >= MATCH_THRESHOLD) {
        foundTypes.add(pattern.id);
      }
    }

    if (foundTypes.size > 0) {
      result.set(col.name, classifyPii([...foundTypes]));
    } else {
      result.set(col.name, 'none');
    }
  }

  return result;
}

/**
 * Classify PII severity from detected PII types.
 */
export function classifyPii(found: string[]): PiiLevel {
  if (found.length === 0) return 'none';
  if (found.includes('ssn')) return 'restricted';
  if (found.includes('email') && found.length >= 2) return 'high';
  if (found.includes('email') || found.includes('phone')) return 'medium';
  if (found.includes('ip')) return 'low';
  return 'low';
}

/**
 * Scan a single column of values for PII and return detected types.
 */
export function scanColumnPii(values: unknown[]): PiiType[] {
  const found: PiiType[] = [];
  for (const pattern of PII_PATTERNS) {
    const matches = new Set<string>();
    for (const val of values) {
      if (typeof val !== 'string') continue;
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.regex.exec(val)) !== null) {
        if (m[0]) matches.add(m[0]);
      }
    }
    if (matches.size >= MATCH_THRESHOLD) {
      found.push(pattern.id);
    }
  }
  return found;
}
