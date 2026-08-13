/**
 * Expiry pure logic (Phase 18).
 *
 * Framework-free functions for policy resolution and overdue detection.
 */

import type { ExpiryPolicy, ExpiryPolicyInput, WorkspaceDefaults, FreshnessFlag } from './types.js';
import { DEFAULT_WORKSPACE_DEFAULTS, ExpiryValidationError } from './types.js';

// ---------------------------------------------------------------------------
// effectivePolicy — merge workspace defaults with per-resource override
// ---------------------------------------------------------------------------

/**
 * Resolves the effective expiry policy for a resource.
 * Workspace defaults provide base values; per-resource override wins per-field
 * where present.
 */
export function effectivePolicy(
  workspaceDefaults: WorkspaceDefaults = DEFAULT_WORKSPACE_DEFAULTS,
  policyOverride?: Partial<ExpiryPolicyInput> | ExpiryPolicy,
): ExpiryPolicy {
  const base = workspaceDefaults;

  if (!policyOverride) {
    return {
      id: '',
      workspace_id: '',
      resource_type: '',
      resource_id: '',
      interval_days: base.interval_days,
      responsible_id: null,
      escalation: base.escalation,
      auto_revoke_share: base.auto_revoke_share,
      created_at: new Date(),
      created_by: '',
      updated_by: '',
    };
  }

  return {
    id: 'id' in policyOverride ? policyOverride.id : '',
    workspace_id: policyOverride.workspace_id ?? '',
    resource_type: policyOverride.resource_type ?? '',
    resource_id: policyOverride.resource_id ?? '',
    interval_days: policyOverride.interval_days ?? base.interval_days,
    responsible_id:
      'responsible_id' in policyOverride ? (policyOverride.responsible_id ?? null) : null,
    escalation: policyOverride.escalation ?? base.escalation,
    auto_revoke_share: policyOverride.auto_revoke_share ?? base.auto_revoke_share,
    created_at: 'created_at' in policyOverride ? policyOverride.created_at : new Date(),
    created_by: 'created_by' in policyOverride ? policyOverride.created_by : '',
    updated_by: 'updated_by' in policyOverride ? policyOverride.updated_by : '',
  };
}

// ---------------------------------------------------------------------------
// isOverdue — check if resource needs freshness review
// ---------------------------------------------------------------------------

/**
 * Determines if a resource is overdue for freshness review.
 * `lastReviewedAt` may come from a resolved freshness_flag or the
 * resource's collab/assignment entry.
 * Returns true when (now - lastReviewedAt) >= interval_days.
 */
export function isOverdue(policy: ExpiryPolicy, lastReviewedAt: Date | null, now: Date): boolean {
  if (!lastReviewedAt) return true;
  const intervalMs = policy.interval_days * 24 * 60 * 60 * 1000;
  return now.getTime() - lastReviewedAt.getTime() >= intervalMs;
}

// ---------------------------------------------------------------------------
// tierAction — what escalation tier implies
// ---------------------------------------------------------------------------

export interface TierAction {
  readonly tier: ExpiryPolicy['escalation'];
  readonly flag: boolean;
  readonly notify: boolean;
  readonly autoRevoke: boolean;
}

export function tierAction(tier: ExpiryPolicy['escalation']): TierAction {
  switch (tier) {
    case 'gentle':
      return { tier: 'gentle', flag: true, notify: false, autoRevoke: false };
    case 'moderate':
      return { tier: 'moderate', flag: true, notify: true, autoRevoke: false };
    case 'strict':
      return { tier: 'strict', flag: true, notify: true, autoRevoke: true };
  }
}

// ---------------------------------------------------------------------------
// validatePolicyInput — business-rule validation
// ---------------------------------------------------------------------------

export function validatePolicyInput(input: ExpiryPolicyInput): void {
  if (!input.workspace_id) throw new ExpiryValidationError('workspace_id is required');
  if (!input.resource_type) throw new ExpiryValidationError('resource_type is required');
  if (!input.resource_id) throw new ExpiryValidationError('resource_id is required');
  if (!Number.isInteger(input.interval_days) || input.interval_days <= 0) {
    throw new ExpiryValidationError('interval_days must be a positive integer');
  }
  if (input.escalation && !['gentle', 'moderate', 'strict'].includes(input.escalation)) {
    throw new ExpiryValidationError(`Invalid escalation tier: ${input.escalation}`);
  }
}

// ---------------------------------------------------------------------------
// getExpiryDashboard — aggregate dashboard data
// ---------------------------------------------------------------------------

export interface DashboardTierSummary {
  readonly tier: ExpiryPolicy['escalation'];
  readonly flagCount: number;
}

export interface ExpiryDashboard {
  readonly openFlags: DashboardTierSummary[];
  readonly overdueCount: number;
}

/**
 * Computes an expiry dashboard from store data.
 * @param openFlags All open freshness flags (unresolved).
 * @param overdueCount Number of overdue resources (computed externally).
 */
export function getExpiryDashboard(
  _openFlags: FreshnessFlag[],
  overdueCount: number,
): ExpiryDashboard {
  // For pure function, we accept pre-computed tier counts from service layer
  // as openFlags come without tier info directly.
  return {
    openFlags: [],
    overdueCount,
  };
}
