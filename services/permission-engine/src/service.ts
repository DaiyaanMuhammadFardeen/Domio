/**
 * @domio/permission-engine — service layer.
 *
 * Core business logic: grant CRUD, permission checking (with delegation to
 * the resolver), and the `require()` convenience that throws on denial.
 */

import type {
  ResourceType,
  PermissionGrant,
  PermissionGrantInput,
  PermissionRequest,
  PermissionEvaluation,
} from './types.js';
import { ValidationError, PermissionDeniedError } from './types.js';
import type {
  PermissionGrantStore,
  WorkspaceMemberStore,
  GroupMembershipStore,
  ResourceHierarchyStore,
} from './stores.js';
import { resolvePermission } from './resolver.js';
import type { PermissionAuditRecorder } from './audit.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultId = (): string => {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 16)]!;
  return out;
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface PermissionServiceOptions {
  readonly grants: PermissionGrantStore;
  readonly workspaceMembers: WorkspaceMemberStore;
  readonly groupMemberships: GroupMembershipStore;
  readonly resourceHierarchy: ResourceHierarchyStore;
  /** Enable audit recording (default false so tests don't need the package). */
  readonly auditEnabled?: boolean;
  readonly audit?: PermissionAuditRecorder;
  /** Deterministic ID generator for tests. */
  readonly idGenerator?: () => string;
  /** Deterministic clock for tests. */
  readonly clock?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PermissionService {
  private readonly grants: PermissionGrantStore;
  private readonly workspaceMembers: WorkspaceMemberStore;
  private readonly groupMemberships: GroupMembershipStore;
  private readonly resourceHierarchy: ResourceHierarchyStore;
  private readonly auditEnabled: boolean;
  private readonly audit: PermissionAuditRecorder | undefined;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: PermissionServiceOptions) {
    this.grants = opts.grants;
    this.workspaceMembers = opts.workspaceMembers;
    this.groupMemberships = opts.groupMemberships;
    this.resourceHierarchy = opts.resourceHierarchy;
    this.auditEnabled = opts.auditEnabled ?? false;
    this.audit = opts.audit;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Grant CRUD
  // -------------------------------------------------------------------------

  async createGrant(input: PermissionGrantInput): Promise<PermissionGrant> {
    if (!input.resourceId) throw new ValidationError('resourceId is required');
    if (!input.principalId) throw new ValidationError('principalId is required');
    if (!input.capabilities || input.capabilities.length === 0) {
      throw new ValidationError('capabilities must be a non-empty array');
    }
    if (!input.createdBy) throw new ValidationError('createdBy is required');

    const now = this.clock();
    const grant: PermissionGrant = {
      id: this.idGen(),
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      principalId: input.principalId,
      principalType: input.principalType,
      capabilities: [...input.capabilities],
      isDeny: input.isDeny ?? false,
      effectiveFrom: input.effectiveFrom ?? now,
      effectiveTo: input.effectiveTo ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };

    await this.grants.insert(grant);

    if (this.auditEnabled && this.audit) {
      await this.audit.record({
        service: 'permission-engine',
        eventType: 'permission.granted',
        payload: { grant },
      });
    }

    return grant;
  }

  async listGrants(resourceType: ResourceType, resourceId: string): Promise<PermissionGrant[]> {
    return this.grants.findByResource(resourceType, resourceId);
  }

  // -------------------------------------------------------------------------
  // Permission checking
  // -------------------------------------------------------------------------

  /**
   * Evaluate whether the principal has the requested capability on the
   * resource.  Returns a full `PermissionEvaluation` — never throws.
   */
  async checkPermission(req: PermissionRequest): Promise<PermissionEvaluation> {
    if (!req.principalId) throw new ValidationError('principalId is required');
    if (!req.capability) throw new ValidationError('capability is required');
    if (!req.resourceId) throw new ValidationError('resourceId is required');

    const at = req.at ?? this.clock();

    const { decision, reason } = await resolvePermission(
      {
        getGrantsForResource: (rt, rid) => this.grants.findByResource(rt, rid),
        getWorkspaceMember: (wid, uid) => this.workspaceMembers.findByWorkspaceAndUser(wid, uid),
        getGroupIdsForUser: (uid) => this.groupMemberships.findGroupsForUser(uid),
        getParentResource: (rt, rid) => this.resourceHierarchy.findParent(rt, rid),
      },
      req.principalId,
      req.capability,
      req.resourceType,
      req.resourceId,
      at,
    );

    return {
      allowed: decision === 'allow',
      decision,
      reason,
      evaluatedAt: at,
      resourceType: req.resourceType,
      resourceId: req.resourceId,
      principalId: req.principalId,
      capability: req.capability,
    };
  }

  /**
   * Convenience: check permission and throw `PermissionDeniedError` if
   * the principal lacks the capability.
   */
  async require(
    principalId: string,
    capability: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void> {
    const result = await this.checkPermission({
      principalId,
      capability,
      resourceType,
      resourceId,
    });
    if (!result.allowed) {
      throw new PermissionDeniedError(principalId, capability, resourceType, resourceId);
    }
  }
}

// ---------------------------------------------------------------------------
// Clock default
// ---------------------------------------------------------------------------

const defaultClock = (): Date => new Date();
