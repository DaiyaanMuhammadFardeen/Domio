/**
 * Expiry service (Phase 18).
 *
 * Transport-agnostic orchestration of expiry policies and freshness flags.
 * Depends on:
 *  - {@link ExpiryStore}       — persistence.
 *  - {@link ExpiryEventEmitter} — event emission (default: noopEmitter).
 *  - {@link ShareRevoker}       — external share revocation (default: NoopShareRevoker).
 *  - {@link isLegalHoldFn}      — legal-hold predicate (default: () => false).
 */

import { randomUUID } from 'crypto';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type { ExpiryPolicy, ExpiryPolicyInput, ExpiryEventEmitter, FreshnessFlag, ShareRevoker, WorkspaceDefaults } from './types.js';
import { DEFAULT_WORKSPACE_DEFAULTS, PolicyNotFoundError, NoopShareRevoker, noopEmitter } from './types.js';
import type { ExpiryStore } from './store/store.js';
import { validatePolicyInput, isOverdue, tierAction } from './policies.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface ExpiryServiceOptions {
  readonly store: ExpiryStore;
  readonly eventEmitter?: ExpiryEventEmitter;
  readonly shareRevoker?: ShareRevoker;
  /** Legal-hold predicate. Returns true if resource is on legal hold. */
  readonly isLegalHold?: (resourceType: string, resourceId: string) => boolean | Promise<boolean>;
  /** Workspace defaults resolver. */
  readonly getWorkspaceDefaults?: (workspaceId: string) => Promise<WorkspaceDefaults | null>;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExpiryService {
  private readonly store: ExpiryStore;
  private readonly emitter: ExpiryEventEmitter;
  private readonly shareRevoker: ShareRevoker;
  private readonly isLegalHoldFn: (resourceType: string, resourceId: string) => boolean | Promise<boolean>;
  private readonly getWorkspaceDefaults: (workspaceId: string) => Promise<WorkspaceDefaults | null>;
  private readonly clock: () => Date;

  constructor(opts: ExpiryServiceOptions) {
    if (!opts.store) throw new Error('ExpiryService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.shareRevoker = opts.shareRevoker ?? NoopShareRevoker;
    this.isLegalHoldFn = opts.isLegalHold ?? (() => false);
    this.getWorkspaceDefaults = opts.getWorkspaceDefaults ?? (async () => null);
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Upsert policy
  // -------------------------------------------------------------------------

  async upsertPolicy(input: ExpiryPolicyInput, actorId: string): Promise<ExpiryPolicy> {
    checkFeature(FEATURE_FLAGS.expiry);
    validatePolicyInput(input);

    const defaults = await this.getWorkspaceDefaults(input.workspace_id);
    const wsDefaults = defaults ?? DEFAULT_WORKSPACE_DEFAULTS;

    const existing = await this.store.getPolicy(input.resource_type, input.resource_id);

    const policy: ExpiryPolicy = {
      id: existing?.id ?? this.idGen(),
      workspace_id: input.workspace_id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      interval_days: input.interval_days,
      responsible_id: input.responsible_id ?? existing?.responsible_id ?? null,
      escalation: input.escalation ?? existing?.escalation ?? wsDefaults.escalation,
      auto_revoke_share: input.auto_revoke_share ?? existing?.auto_revoke_share ?? wsDefaults.auto_revoke_share,
      created_at: existing?.created_at ?? this.now(),
      created_by: existing?.created_by ?? actorId,
      updated_by: actorId,
    };

    await this.store.upsertPolicy(policy);
    return policy;
  }

  // -------------------------------------------------------------------------
  // Get policy
  // -------------------------------------------------------------------------

  async getPolicy(resourceType: string, resourceId: string): Promise<ExpiryPolicy> {
    checkFeature(FEATURE_FLAGS.expiry);
    const policy = await this.store.getPolicy(resourceType, resourceId);
    if (!policy) throw new PolicyNotFoundError(resourceType, resourceId);
    return policy;
  }

  // -------------------------------------------------------------------------
  // List policies
  // -------------------------------------------------------------------------

  async listPolicies(workspaceId: string): Promise<ExpiryPolicy[]> {
    checkFeature(FEATURE_FLAGS.expiry);
    return this.store.listPolicies(workspaceId);
  }

  // -------------------------------------------------------------------------
  // Scan a single resource — flag overdue + apply escalation
  // -------------------------------------------------------------------------

  async scanResource(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    lastReviewedAt: Date | null,
  ): Promise<{ flagged: boolean; revoked: boolean }> {
    checkFeature(FEATURE_FLAGS.expiry);

    // Legal-hold suppresses flagging
    const held = await this.isLegalHoldFn(resourceType, resourceId);
    if (held) return { flagged: false, revoked: false };

    const defaults = await this.getWorkspaceDefaults(workspaceId);
    const wsDefaults = defaults ?? DEFAULT_WORKSPACE_DEFAULTS;

    const override = await this.store.getPolicy(resourceType, resourceId);
    const policyOverrides = override
      ? { interval_days: override.interval_days, escalation: override.escalation, auto_revoke_share: override.auto_revoke_share }
      : undefined;

    // Build effective policy (using workspace defaults + optional override)
    const effectiveInterval = policyOverrides?.interval_days ?? wsDefaults.interval_days;
    const effectiveEscalation = policyOverrides?.escalation ?? wsDefaults.escalation;
    const effectiveAutoRevoke = policyOverrides?.auto_revoke_share ?? wsDefaults.auto_revoke_share;

    const effectivePolicyObj: ExpiryPolicy = {
      id: override?.id ?? '',
      workspace_id: workspaceId,
      resource_type: resourceType,
      resource_id: resourceId,
      interval_days: effectiveInterval,
      responsible_id: override?.responsible_id ?? null,
      escalation: effectiveEscalation,
      auto_revoke_share: effectiveAutoRevoke,
      created_at: override?.created_at ?? this.now(),
      created_by: override?.created_by ?? '',
      updated_by: override?.updated_by ?? '',
    };

    if (!isOverdue(effectivePolicyObj, lastReviewedAt, this.now())) {
      return { flagged: false, revoked: false };
    }

    // Check for existing open flag — idempotent
    const openFlags = await this.store.listOpenFlags(resourceType, resourceId);
    if (openFlags.length > 0) {
      return { flagged: false, revoked: false };
    }

    const action = tierAction(effectiveEscalation);

    // Insert flag
    const flag: FreshnessFlag = {
      id: this.idGen(),
      workspace_id: workspaceId,
      resource_type: resourceType,
      resource_id: resourceId,
      flagged_at: this.now(),
      reason: 'policy_overdue',
      resolved_at: null,
      resolved_by: null,
      created_at: this.now(),
    };

    await this.store.insertFlag(flag);

    // Emit flag applied event
    await this.emitter.publish('expiry.flag_applied', {
      event_id: this.idGen(),
      event_type: 'expiry.flag_applied',
      ts_ms: this.now().getTime(),
      workspace_id: workspaceId,
      actor_id: 'system',
      actor_type: 'system',
      payload: {
        resource_type: resourceType,
        resource_id: resourceId,
        escalation: effectiveEscalation,
        flag_id: flag.id,
      },
    });

    // Moderate tier: emit notification event
    if (action.notify) {
      await this.emitter.publish('expiry.notification', {
        event_id: this.idGen(),
        event_type: 'expiry.notification',
        ts_ms: this.now().getTime(),
        workspace_id: workspaceId,
        actor_id: 'system',
        actor_type: 'system',
        payload: {
          resource_type: resourceType,
          resource_id: resourceId,
          escalation: effectiveEscalation,
          action: 'notify',
        },
      });
    }

    // Strict tier: auto-revoke external share
    let revoked = false;
    if (effectiveAutoRevoke && action.autoRevoke) {
      const result = await this.shareRevoker.revokeShare(resourceType, resourceId, effectivePolicyObj);
      if (result) {
        revoked = true;
        await this.emitter.publish('expiry.share_revoked', {
          event_id: this.idGen(),
          event_type: 'expiry.share_revoked',
          ts_ms: this.now().getTime(),
          workspace_id: workspaceId,
          actor_id: 'system',
          actor_type: 'system',
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
            share_link_id: result.share_link_id,
          },
        });
      }
    }

    return { flagged: true, revoked };
  }

  // -------------------------------------------------------------------------
  // Scan workspace — check all resources
  // -------------------------------------------------------------------------

  async scanWorkspace(
    workspaceId: string,
    resources: Array<{ type: string; id: string; lastReviewedAt?: Date | null }>,
  ): Promise<{ scanned: number; flagged: number; revoked: number }> {
    checkFeature(FEATURE_FLAGS.expiry);

    let scanned = 0;
    let flagged = 0;
    let revoked = 0;

    for (const r of resources) {
      scanned++;
      const result = await this.scanResource(workspaceId, r.type, r.id, r.lastReviewedAt ?? null);
      if (result.flagged) flagged++;
      if (result.revoked) revoked++;
    }

    return { scanned, flagged, revoked };
  }

  // -------------------------------------------------------------------------
  // Confirm freshness — resolve open flags
  // -------------------------------------------------------------------------

  async confirmFreshness(
    resourceType: string,
    resourceId: string,
    actorId: string,
  ): Promise<{ resolved: number }> {
    checkFeature(FEATURE_FLAGS.expiry);
    const now = this.now();
    const resolved = await this.store.resolveFlags(resourceType, resourceId, {
      resolvedAt: now,
      resolvedBy: actorId,
    });

    if (resolved > 0) {
      await this.emitter.publish('expiry.freshness_confirmed', {
        event_id: this.idGen(),
        event_type: 'expiry.freshness_confirmed',
        ts_ms: now.getTime(),
        workspace_id: '',
        actor_id: actorId,
        actor_type: 'member',
        payload: {
          resource_type: resourceType,
          resource_id: resourceId,
          resolved_count: resolved,
        },
      });
    }

    return { resolved };
  }

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------

  async getExpiryDashboard(workspaceId: string): Promise<{
    openFlagsByTier: Array<{ tier: string; count: number }>;
    overdueCount: number;
    totalPolicies: number;
  }> {
    checkFeature(FEATURE_FLAGS.expiry);

    const openFlags = await this.store.listOpenFlags();
    const workspaceFlags = openFlags.filter(f => f.workspace_id === workspaceId);
    const policies = await this.store.listPolicies(workspaceId);

    // Group open flags by tier (using policy lookup)
    const tierCounts: Record<string, number> = {};
    let overdueCount = 0;
    for (const flag of workspaceFlags) {
      const policy = await this.store.getPolicy(flag.resource_type, flag.resource_id);
      const tier = policy?.escalation ?? 'gentle';
      tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    }

    // Count overdue policies
    for (const policy of policies) {
      const openFlagsForResource = workspaceFlags.filter(
        f => f.resource_type === policy.resource_type && f.resource_id === policy.resource_id,
      );
      if (openFlagsForResource.length > 0) {
        overdueCount++;
      }
    }

    return {
      openFlagsByTier: Object.entries(tierCounts).map(([tier, count]) => ({ tier, count })),
      overdueCount,
      totalPolicies: policies.length,
    };
  }
}
