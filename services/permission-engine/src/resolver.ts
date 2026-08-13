/**
 * @domio/permission-engine — permission resolver.
 *
 * Core resolution algorithm:
 *   1. Build the ancestor chain from target resource up to workspace root.
 *   2. Check ancestors (excluding target) for deny grants → ancestor deny
 *      blocks the entire descendant subtree.
 *   3. Walk from target upward looking for effective grants; at each level
 *      deny overrides allow.  First effective level wins.
 *   4. Fall back to workspace role baseline (owner/admin/editor/commenter/viewer).
 *
 * Group expansion: for a user principal, we also consider grants whose
 * principalType is 'group' and whose principalId matches a group the
 * user belongs to.
 */

import type { ResourceType, WorkspaceRole, PermissionGrant, PermissionDecision } from './types.js';

// ---------------------------------------------------------------------------
// Resolver context — abstracted stores for testability
// ---------------------------------------------------------------------------

export interface ResolverContext {
  /** All grants for a specific resource (direct, not inherited). */
  getGrantsForResource(resourceType: ResourceType, resourceId: string): Promise<PermissionGrant[]>;
  /** Workspace member record for the given user. */
  getWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<{
    role: WorkspaceRole;
    capabilities: readonly string[];
    effectiveFrom: Date;
    effectiveTo: Date | null;
  } | null>;
  /** Group IDs the given user belongs to. */
  getGroupIdsForUser(userId: string): Promise<string[]>;
  /** Parent resource of the given resource. */
  getParentResource(
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<{ parentType: ResourceType; parentId: string } | null>;
}

// ---------------------------------------------------------------------------
// Role baseline capabilities
// ---------------------------------------------------------------------------

const ROLE_BASELINE: Record<WorkspaceRole, readonly string[]> = {
  owner: ['view', 'edit', 'comment', 'approve', 'share', 'export', 'manage_permissions'],
  admin: ['view', 'edit', 'comment', 'approve', 'share', 'export', 'manage_permissions'],
  editor: ['view', 'edit', 'comment', 'approve'],
  commenter: ['view', 'comment'],
  viewer: ['view'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTemporal(grant: { effectiveFrom: Date; effectiveTo: Date | null }, at: Date): boolean {
  if (grant.effectiveFrom > at) return false;
  if (grant.effectiveTo && grant.effectiveTo < at) return false;
  return true;
}

function isRoleTemporal(
  member: { effectiveFrom: Date; effectiveTo: Date | null },
  at: Date,
): boolean {
  if (member.effectiveFrom > at) return false;
  if (member.effectiveTo && member.effectiveTo < at) return false;
  return true;
}

/**
 * From a pool of grants, return those relevant to the given principal
 * (user direct + group via membership) and capability, that are
 * temporally valid at `at`.
 */
function findRelevantGrants(
  grants: readonly PermissionGrant[],
  principalId: string,
  groupIds: readonly string[],
  capability: string,
  at: Date,
): PermissionGrant[] {
  const groupSet = new Set(groupIds);
  return grants.filter((g) => {
    if (!isTemporal(g, at)) return false;
    if (!g.capabilities.includes(capability)) return false;
    if (g.principalType === 'user' && g.principalId === principalId) return true;
    if (g.principalType === 'group' && groupSet.has(g.principalId)) return true;
    return false;
  });
}

/**
 * From a list of effective grants at the same level, produce the effective
 * decision: deny overrides allow.
 */
function effectiveAtLevel(grants: readonly PermissionGrant[]): PermissionDecision | null {
  if (grants.length === 0) return null;
  if (grants.some((g) => g.isDeny)) return 'deny';
  return 'allow';
}

// ---------------------------------------------------------------------------
// Ancestor chain builder
// ---------------------------------------------------------------------------

export async function buildAncestorChain(
  getParent: (
    rt: ResourceType,
    rid: string,
  ) => Promise<{ parentType: ResourceType; parentId: string } | null>,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Array<{ resourceType: ResourceType; resourceId: string }>> {
  const chain: Array<{ resourceType: ResourceType; resourceId: string }> = [];
  let currentType: ResourceType | null = resourceType;
  let currentId: string = resourceId;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    chain.push({ resourceType: currentType, resourceId: currentId });
    if (currentType === 'workspace') break;
    const parent = await getParent(currentType, currentId);
    if (!parent) break;
    currentType = parent.parentType;
    currentId = parent.parentId;
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export async function resolvePermission(
  ctx: ResolverContext,
  principalId: string,
  capability: string,
  resourceType: ResourceType,
  resourceId: string,
  at: Date = new Date(),
): Promise<{ decision: PermissionDecision; reason: string }> {
  // Expand groups for user principal
  const groupIds = await ctx.getGroupIdsForUser(principalId);

  // Build ancestor chain: [target, parent, grandparent, ..., workspace]
  const ancestors = await buildAncestorChain(
    (rt, rid) => ctx.getParentResource(rt, rid),
    resourceType,
    resourceId,
  );

  if (ancestors.length === 0) {
    return { decision: 'deny', reason: 'empty ancestor chain' };
  }

  // Identify workspace root (last element in chain)
  const root = ancestors[ancestors.length - 1]!;
  const workspaceId = root.resourceId;

  // ---- Step 1: Ancestor deny check ----
  // Walk from workspace toward the target (skip the target itself).
  // If ANY ancestor has a deny grant, the entire subtree is blocked.
  for (let i = ancestors.length - 1; i >= 1; i--) {
    const ancestor = ancestors[i]!;
    const grants = await ctx.getGrantsForResource(ancestor.resourceType, ancestor.resourceId);
    const relevant = findRelevantGrants(grants, principalId, groupIds, capability, at);
    const effective = effectiveAtLevel(relevant);

    if (effective === 'deny') {
      return {
        decision: 'deny',
        reason: `deny at ancestor ${ancestor.resourceType}:${ancestor.resourceId}`,
      };
    }
  }

  // ---- Step 2: Target-to-root allow check ----
  // Walk from the target upward.  First level with an effective grant wins.
  // Within a level, deny overrides allow.
  for (const level of ancestors) {
    const grants = await ctx.getGrantsForResource(level.resourceType, level.resourceId);
    const relevant = findRelevantGrants(grants, principalId, groupIds, capability, at);
    const effective = effectiveAtLevel(relevant);

    if (effective === 'deny') {
      return {
        decision: 'deny',
        reason: `deny at ${level.resourceType}:${level.resourceId}`,
      };
    }
    if (effective === 'allow') {
      return {
        decision: 'allow',
        reason: `allow at ${level.resourceType}:${level.resourceId}`,
      };
    }
  }

  // ---- Step 3: Workspace role baseline ----
  const member = await ctx.getWorkspaceMember(workspaceId, principalId);
  if (member && isRoleTemporal(member, at)) {
    const roleCaps = ROLE_BASELINE[member.role] ?? [];
    const memberCaps = new Set([...roleCaps, ...(member.capabilities ?? [])]);
    if (memberCaps.has(capability)) {
      return {
        decision: 'allow',
        reason: `workspace role baseline: ${member.role}`,
      };
    }
  }

  return { decision: 'deny', reason: 'no matching grant or role baseline' };
}
