/**
 * Creator module types (Phase 19 Wave 3 — WS-MKT-6/7).
 *
 * Types for creator onboarding, KYC, and payout setup.
 */

// ---------------------------------------------------------------------------
// Onboarding State
// ---------------------------------------------------------------------------

export type OnboardingState =
  | 'pending'
  | 'profile_complete'
  | 'kyc_required'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'payout_ready'
  | 'active';

// ---------------------------------------------------------------------------
// KYC Status
// ---------------------------------------------------------------------------

export type KycStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

// ---------------------------------------------------------------------------
// Creator Profile
// ---------------------------------------------------------------------------

export interface CreatorProfile {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly slug: string | null;
  readonly bio: string | null;
  readonly countryCode: string | null;
  readonly payoutMethod: string | null;
  readonly payoutReady: boolean;
  readonly kycStatus: KycStatus;
  readonly onboardingState: OnboardingState;
  readonly balanceCents: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// KYC Session
// ---------------------------------------------------------------------------

export interface KycSession {
  readonly id: string;
  readonly creatorId: string;
  readonly vendor: string;
  readonly vendorSessionId: string | null;
  readonly status: KycStatus;
  readonly lastPolledAt: Date | null;
  readonly raw: Record<string, unknown> | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Creator Payout Method
// ---------------------------------------------------------------------------

export type PayoutMethodKind = 'stripe_connect' | 'bkash' | 'nagad' | 'bank';

export interface CreatorPayoutMethod {
  readonly id: string;
  readonly creatorId: string;
  readonly kind: PayoutMethodKind;
  readonly externalAccountId: string;
  readonly verified: boolean;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// KYC Provider Interface
// ---------------------------------------------------------------------------

export interface KycProvider {
  startSession(input: {
    creator_id: string;
    country_code: string;
  }): Promise<{ vendor_session_id: string; session_url: string }>;

  pollStatus(input: {
    creator_id: string;
    kyc_session_id: string;
    vendor: string;
  }): Promise<KycStatus>;
}

// ---------------------------------------------------------------------------
// Payout Connect Provider Interface
// ---------------------------------------------------------------------------

export interface PayoutConnectProvider {
  getConnectLink(input: {
    creator_id: string;
    kind: PayoutMethodKind;
  }): Promise<{ connect_url: string; expires_at: Date }>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OnboardingTransitionError extends Error {
  readonly code = 'ONBOARDING_TRANSITION_ERROR' as const;
  constructor(
    public readonly from: OnboardingState,
    public readonly to: OnboardingState,
  ) {
    super(`Invalid onboarding transition: ${from} → ${to}`);
    this.name = 'OnboardingTransitionError';
  }
}

export class KycNotStartedError extends Error {
  readonly code = 'KYC_NOT_STARTED' as const;
  constructor() {
    super('KYC session not started');
    this.name = 'KycNotStartedError';
  }
}

export class KycInProgressError extends Error {
  readonly code = 'KYC_IN_PROGRESS' as const;
  constructor() {
    super('KYC session already in progress');
    this.name = 'KycInProgressError';
  }
}

export class PayoutMethodNotFoundError extends Error {
  readonly code = 'PAYOUT_METHOD_NOT_FOUND' as const;
  constructor() {
    super('Payout method not found');
    this.name = 'PayoutMethodNotFoundError';
  }
}

export class PayoutNotReadyError extends Error {
  readonly code = 'PAYOUT_NOT_READY' as const;
  constructor() {
    super('Payout not ready: KYC must be approved');
    this.name = 'PayoutNotReadyError';
  }
}
