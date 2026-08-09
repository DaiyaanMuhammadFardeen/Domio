/**
 * Takedown request types (Phase 19 Wave 4 — WS-MKT-8).
 *
 * Types for DMCA/trademark/policy takedown filings + trust scoring.
 * Tables: takedown_request, trust_score (migration 0084).
 */

// ---------------------------------------------------------------------------
// Takedown Kind
// ---------------------------------------------------------------------------

export type TakedownKind = 'dmca' | 'trademark' | 'policy';

// ---------------------------------------------------------------------------
// Takedown Status
// ---------------------------------------------------------------------------

export type TakedownStatus =
  | 'received'
  | 'in_review'
  | 'confirmed'
  | 'dismissed'
  | 'counter_notice'
  | 'resolved';

// ---------------------------------------------------------------------------
// Takedown Request
// ---------------------------------------------------------------------------

export interface TakedownRequest {
  readonly id: string;
  readonly workspaceId: string;
  readonly listingId: string;
  readonly claimantId: string;
  readonly kind: TakedownKind;
  readonly evidenceUrl: string | null;
  readonly statement: string;
  readonly status: TakedownStatus;
  readonly resolutionNotes: string | null;
  readonly submittedAt: Date;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Trust Score
// ---------------------------------------------------------------------------

export interface TrustScore {
  readonly id: string;
  readonly listingId: string;
  readonly score: number;
  readonly signals: Record<string, unknown>;
  readonly computedAt: Date;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidTakedownTransitionError extends Error {
  readonly code = 'INVALID_TAKEDOWN_TRANSITION' as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid takedown transition: ${from} → ${to}`);
    this.name = 'InvalidTakedownTransitionError';
  }
}

export class TakedownNotFoundError extends Error {
  readonly code = 'TAKEDOWN_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TakedownNotFoundError';
  }
}

export class TrustScoreNotFoundError extends Error {
  readonly code = 'TRUST_SCORE_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TrustScoreNotFoundError';
  }
}
