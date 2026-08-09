/**
 * Takedown request + trust scoring logic (Phase 19 Wave 4 — WS-MKT-8).
 *
 * Pure logic for takedown lifecycle and trust score computation.
 * No I/O, no side effects.
 */

import type { TakedownKind, TakedownStatus } from './types.js';
import { InvalidTakedownTransitionError } from './types.js';

// ---------------------------------------------------------------------------
// Takedown transitions
// ---------------------------------------------------------------------------

/**
 * Allowed takedown status transitions.
 *
 * Flow:
 *   received → in_review → confirmed → counter_notice → resolved
 *                           dismissed → resolved
 */
export const TAKEDOWN_TRANSITIONS: Record<TakedownStatus, readonly TakedownStatus[]> = {
  received:       ['in_review'],
  in_review:      ['confirmed', 'dismissed'],
  confirmed:      ['counter_notice', 'resolved'],
  dismissed:      ['resolved'],
  counter_notice: ['resolved'],
  resolved:       [],
};

/**
 * Validate whether a takedown transition is allowed.
 * Throws InvalidTakedownTransitionError if not.
 */
export function validateTakedownTransition(
  from: TakedownStatus,
  to: TakedownStatus,
): void {
  const allowed = TAKEDOWN_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidTakedownTransitionError(from, to);
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const VALID_KINDS: readonly TakedownKind[] = ['dmca', 'trademark', 'policy'];

/**
 * Validate takedown filing input.
 */
export function validateTakedownInput(input: {
  kind: string;
  statement: string;
  evidenceUrl?: string | null | undefined;
}): void {
  if (!input.kind) {
    throw new Error('kind is required');
  }
  if (!VALID_KINDS.includes(input.kind as TakedownKind)) {
    throw new Error(`Invalid takedown kind: '${input.kind}'. Must be one of: ${VALID_KINDS.join(', ')}`);
  }
  if (!input.statement || input.statement.trim().length === 0) {
    throw new Error('statement is required and must be non-empty');
  }
  if (input.statement.length > 4000) {
    throw new Error(`statement must be at most 4000 characters, got ${input.statement.length}`);
  }
  if (input.evidenceUrl != null && input.evidenceUrl.length > 0) {
    let url: URL;
    try {
      url = new URL(input.evidenceUrl);
    } catch {
      throw new Error('evidence_url must be a valid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('evidence_url must use http or https protocol');
    }
  }
}

// ---------------------------------------------------------------------------
// Body functions
// ---------------------------------------------------------------------------

/**
 * File a new takedown request. Returns initial state fields.
 */
export function fileTakedownBody(): {
  status: 'received';
  submittedAt: Date;
} {
  return {
    status: 'received',
    submittedAt: new Date(),
  };
}

/**
 * Resolve a confirmed takedown. Sets listing to 'removed' + resolved_at.
 */
export function resolveBody(
  currentStatus: TakedownStatus,
): {
  status: 'resolved';
  resolvedAt: Date;
  listingStatus: 'removed' | null;
} {
  if (currentStatus !== 'confirmed') {
    throw new InvalidTakedownTransitionError(currentStatus, 'resolved');
  }
  return {
    status: 'resolved',
    resolvedAt: new Date(),
    listingStatus: 'removed',
  };
}

/**
 * Dismiss a takedown. Sets resolved_at.
 */
export function dismissBody(
  currentStatus: TakedownStatus,
): {
  status: 'resolved';
  resolvedAt: Date;
} {
  if (currentStatus !== 'in_review') {
    throw new InvalidTakedownTransitionError(currentStatus, 'resolved');
  }
  return {
    status: 'resolved',
    resolvedAt: new Date(),
  };
}

/**
 * File a counter-notice. Transitions confirmed → counter_notice.
 */
export function counterNoticeBody(
  currentStatus: TakedownStatus,
): {
  status: 'counter_notice';
} {
  if (currentStatus !== 'confirmed') {
    throw new InvalidTakedownTransitionError(currentStatus, 'counter_notice');
  }
  return {
    status: 'counter_notice',
  };
}

// ---------------------------------------------------------------------------
// Trust scoring
// ---------------------------------------------------------------------------

/**
 * Compute a trust score from signals.
 * Simple weighted average: each signal contributes a value between 0 and 1.
 * Default score is 0 (no signals = no trust).
 */
export function computeTrustScore(
  signals: Record<string, unknown>,
): number {
  const weights: Record<string, number> = {
    malware_scan: 0.3,
    pricing_anomaly: 0.2,
    review_sentiment: 0.25,
    seller_history: 0.15,
    listing_quality: 0.1,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const val = signals[key];
    if (typeof val === 'number' && val >= 0 && val <= 1) {
      weightedSum += val * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0;
  // Round to 4 decimal places (numeric(5,4) in DB)
  return Math.round((weightedSum / totalWeight) * 10000) / 10000;
}
