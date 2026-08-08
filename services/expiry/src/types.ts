/**
 * Expiry service — shared types and errors (Phase 18).
 *
 * Types for expiry policies, freshness flags, and related errors.
 */

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export type EscalationTier = 'gentle' | 'moderate' | 'strict';

// ---------------------------------------------------------------------------
// ExpiryPolicy
// ---------------------------------------------------------------------------

export interface ExpiryPolicy {
  readonly id: string;
  readonly workspace_id: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly interval_days: number;
  readonly responsible_id: string | null;
  readonly escalation: EscalationTier;
  readonly auto_revoke_share: boolean;
  readonly created_at: Date;
  readonly created_by: string;
  readonly updated_by: string;
}

// ---------------------------------------------------------------------------
// ExpiryPolicyInput
// ---------------------------------------------------------------------------

export interface ExpiryPolicyInput {
  readonly workspace_id: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly interval_days: number;
  readonly responsible_id?: string;
  readonly escalation?: EscalationTier;
  readonly auto_revoke_share?: boolean;
}

// ---------------------------------------------------------------------------
// Workspace defaults
// ---------------------------------------------------------------------------

export interface WorkspaceDefaults {
  readonly interval_days: number;
  readonly escalation: EscalationTier;
  readonly auto_revoke_share: boolean;
}

export const DEFAULT_WORKSPACE_DEFAULTS: WorkspaceDefaults = {
  interval_days: 90,
  escalation: 'gentle',
  auto_revoke_share: false,
};

// ---------------------------------------------------------------------------
// FreshnessFlag
// ---------------------------------------------------------------------------

export type FlagReason = 'policy_overdue' | 'manual' | 'ai_detected';

export interface FreshnessFlag {
  readonly id: string;
  readonly workspace_id: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly flagged_at: Date;
  readonly reason: FlagReason;
  readonly resolved_at: Date | null;
  readonly resolved_by: string | null;
  readonly created_at: Date;
}

// ---------------------------------------------------------------------------
// ShareRevoker (injected dependency — Wave 5 for real impl)
// ---------------------------------------------------------------------------

export interface ShareRevoker {
  revokeShare(
    resourceType: string,
    resourceId: string,
    policy: ExpiryPolicy,
  ): Promise<{ share_link_id: string } | null>;
}

export const NoopShareRevoker: ShareRevoker = {
  async revokeShare(): Promise<null> {
    return null;
  },
};

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface ExpiryEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id?: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface ExpiryEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: ExpiryEventEmitter = {
  async publish(): Promise<void> { /* drop */ },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ExpiryValidationError extends Error {
  readonly code = 'EXPIRY_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ExpiryValidationError';
  }
}

export class PolicyNotFoundError extends Error {
  readonly code = 'POLICY_NOT_FOUND' as const;
  constructor(resourceType: string, resourceId: string) {
    super(`No expiry policy found for ${resourceType}:${resourceId}`);
    this.name = 'PolicyNotFoundError';
  }
}

export class ResourceFlaggedError extends Error {
  readonly code = 'RESOURCE_ALREADY_FLAGGED' as const;
  constructor(resourceType: string, resourceId: string) {
    super(`Resource ${resourceType}:${resourceId} is already flagged`);
    this.name = 'ResourceFlaggedError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}
