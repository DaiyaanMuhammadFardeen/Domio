/**
 * @domio/permission-engine — repository interfaces and in-memory stores.
 *
 * Four stores back the permission engine:
 *   1. PermissionGrantStore  — permission_grant rows
 *   2. WorkspaceMemberStore  — workspace_member rows
 *   3. GroupMembershipStore  — group ↔ user membership
 *   4. ResourceHierarchyStore — parent resolution for the resource tree
 */

import type {
  ResourceType,
  PermissionGrant,
  WorkspaceMember,
} from './types.js';

// ---------------------------------------------------------------------------
// PermissionGrantStore
// ---------------------------------------------------------------------------

export interface PermissionGrantStore {
  insert(grant: PermissionGrant): Promise<void>;
  findById(id: string): Promise<PermissionGrant | null>;
  findByResource(resourceType: ResourceType, resourceId: string): Promise<PermissionGrant[]>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// WorkspaceMemberStore
// ---------------------------------------------------------------------------

export interface WorkspaceMemberStore {
  findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
}

// ---------------------------------------------------------------------------
// GroupMembershipStore
// ---------------------------------------------------------------------------

export interface GroupMembershipStore {
  /** Return all group IDs that `userId` belongs to. */
  findGroupsForUser(userId: string): Promise<string[]>;
  /** Seed a membership (test helper). */
  addMembership(groupId: string, userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// ResourceHierarchyStore
// ---------------------------------------------------------------------------

export interface ResourceHierarchyStore {
  /**
   * Return the parent of the given resource, or null if the resource is a
   * workspace root (or parent is unknown).
   */
  findParent(
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<{ parentType: ResourceType; parentId: string } | null>;
}

// ===========================================================================
// In-memory implementations
// ===========================================================================

export class InMemoryPermissionGrantStore implements PermissionGrantStore {
  private store = new Map<string, PermissionGrant>();

  async insert(grant: PermissionGrant): Promise<void> {
    this.store.set(grant.id, grant);
  }

  async findById(id: string): Promise<PermissionGrant | null> {
    return this.store.get(id) ?? null;
  }

  async findByResource(resourceType: ResourceType, resourceId: string): Promise<PermissionGrant[]> {
    const out: PermissionGrant[] = [];
    for (const g of this.store.values()) {
      if (g.resourceType === resourceType && g.resourceId === resourceId) {
        out.push(g);
      }
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryWorkspaceMemberStore implements WorkspaceMemberStore {
  private store = new Map<string, WorkspaceMember>();

  private key(workspaceId: string, userId: string): string {
    return `${workspaceId}::${userId}`;
  }

  async upsert(member: WorkspaceMember): Promise<void> {
    this.store.set(this.key(member.workspaceId, member.userId), member);
  }

  async findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.store.get(this.key(workspaceId, userId)) ?? null;
  }
}

export class InMemoryGroupMembershipStore implements GroupMembershipStore {
  /** Map from userId → Set<groupId>. */
  private memberships = new Map<string, Set<string>>();

  async findGroupsForUser(userId: string): Promise<string[]> {
    const groups = this.memberships.get(userId);
    return groups ? [...groups] : [];
  }

  async addMembership(groupId: string, userId: string): Promise<void> {
    let groups = this.memberships.get(userId);
    if (!groups) {
      groups = new Set();
      this.memberships.set(userId, groups);
    }
    groups.add(groupId);
  }
}

export class InMemoryResourceHierarchyStore implements ResourceHierarchyStore {
  /** Map from "type::id" → { parentType, parentId }. */
  private parents = new Map<string, { parentType: ResourceType; parentId: string }>();

  async setParent(
    resourceType: ResourceType,
    resourceId: string,
    parentType: ResourceType,
    parentId: string,
  ): Promise<void> {
    this.parents.set(`${resourceType}::${resourceId}`, { parentType, parentId });
  }

  async findParent(
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<{ parentType: ResourceType; parentId: string } | null> {
    return this.parents.get(`${resourceType}::${resourceId}`) ?? null;
  }
}
