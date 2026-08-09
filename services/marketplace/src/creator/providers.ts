/**
 * Creator provider implementations (Phase 19 Wave 3).
 *
 * Sandbox implementations for KYC and Payout Connect providers.
 * No real API keys; deterministic behavior.
 */

import type { KycProvider, PayoutConnectProvider, KycStatus } from './types.js';

// ---------------------------------------------------------------------------
// Sandbox KYC Provider
// ---------------------------------------------------------------------------

/**
 * In-memory sandbox KYC provider.
 * First poll: 'pending', second poll: 'approved'.
 * Controlled by env MARKETPLACE_KYC_SANDBOX (default: 'true').
 */
export class SandboxKycProvider implements KycProvider {
  private readonly pollCounts = new Map<string, number>();

  async startSession(input: {
    creator_id: string;
    country_code: string;
  }): Promise<{ vendor_session_id: string; session_url: string }> {
    const sessionId = `kyc_${input.creator_id}_${Date.now()}`;
    return {
      vendor_session_id: sessionId,
      session_url: `https://sandbox.kyc.example.com/session/${sessionId}`,
    };
  }

  async pollStatus(input: {
    creator_id: string;
    kyc_session_id: string;
    vendor: string;
  }): Promise<KycStatus> {
    const key = `${input.creator_id}:${input.kyc_session_id}`;
    const count = (this.pollCounts.get(key) ?? 0) + 1;
    this.pollCounts.set(key, count);

    // First poll: pending, second poll: approved
    if (count >= 2) {
      return 'approved';
    }
    return 'pending';
  }
}

// ---------------------------------------------------------------------------
// Sandbox Payout Connect Provider
// ---------------------------------------------------------------------------

/**
 * In-memory sandbox payout connect provider.
 * Returns a deterministic connect URL.
 */
export class SandboxPayoutConnectProvider implements PayoutConnectProvider {
  async getConnectLink(input: {
    creator_id: string;
    kind: string;
  }): Promise<{ connect_url: string; expires_at: Date }> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return {
      connect_url: `https://sandbox.payout.example.com/connect/${input.creator_id}?kind=${input.kind}`,
      expires_at: expiresAt,
    };
  }
}
